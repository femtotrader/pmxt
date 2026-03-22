'use strict';

/**
 * Generates the simple pass-through methods in pmxt/client.py from BaseExchange.ts.
 *
 * Every public method in BaseExchange.ts that is not in SKIP_GENERATE is templated
 * as a POST call to the sidecar and injected between the generation markers in
 * client.py. This ensures the Python SDK surface stays in sync with the core.
 *
 * Return type config (returnPy, pattern, converter) is derived entirely from the
 * TypeScript return type — no manual METHOD_RETURN_CONFIG required. When a new method
 * is added to BaseExchange.ts with a known return type, it appears in client.py
 * automatically on the next generation run.
 *
 * Run: node sdks/python/scripts/generate-client-methods.js
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const BASE_EXCHANGE_PATH = path.join(__dirname, '../../../core/src/BaseExchange.ts');
const CLIENT_PATH = path.join(__dirname, '../pmxt/client.py');

const MARKER_BEGIN = '    # BEGIN GENERATED METHODS';
const MARKER_END = '    # END GENERATED METHODS';

// Methods kept hand-maintained in client.py (special logic, streaming, local-only)
const SKIP_GENERATE = new Set([
    'callApi',
    'defineImplicitApi',
    'loadMarkets',               // Python-level caching
    'fetchOHLCV',                // datetime->ISO conversion
    'fetchTrades',               // special parameter handling
    'watchOrderBook',            // streaming
    'watchTrades',               // streaming
    'watchAddress',              // streaming
    'createOrder',               // outcome shorthand logic
    'buildOrder',                // complex args format
    'submitOrder',               // complex args format
    'getExecutionPrice',         // delegates to getExecutionPriceDetailed
    'getExecutionPriceDetailed', // complex args format
    'filterMarkets',             // pure local computation, no sidecar
    'filterEvents',              // pure local computation, no sidecar
]);

// ---------------------------------------------------------------------------
// TypeScript type name -> Python type info
//
// Maps a TS model/interface name to:
//   pyType    - Python type annotation string (for a single value)
//   converter - name of the _convert_* function in client.py
//   pattern   - (optional) override; only needed for special cases like 'paginated'
//
// When a method returns Promise<Foo[]>, the generator automatically produces
// List[Foo] / array pattern. Promise<Foo> -> single pattern. void -> void.
// Unknown return types fall through to a 'raw' pattern with a console warning.
// ---------------------------------------------------------------------------
const TYPE_MAP = {
    UnifiedMarket: { pyType: 'UnifiedMarket', converter: '_convert_market' },
    UnifiedEvent: { pyType: 'UnifiedEvent', converter: '_convert_event' },
    Order: { pyType: 'Order', converter: '_convert_order' },
    UserTrade: { pyType: 'UserTrade', converter: '_convert_user_trade' },
    Position: { pyType: 'Position', converter: '_convert_position' },
    Balance: { pyType: 'Balance', converter: '_convert_balance' },
    Trade: { pyType: 'Trade', converter: '_convert_trade' },
    OrderBook: { pyType: 'OrderBook', converter: '_convert_order_book' },
    PriceCandle: { pyType: 'PriceCandle', converter: '_convert_candle' },
    // Pagination wrapper: detected by name, not structure — gets its own response handler
    PaginatedMarketsResult: { pyType: 'PaginatedMarketsResult', converter: null, pattern: 'paginated' },
};

// ---------------------------------------------------------------------------
// TypeScript AST helpers
// ---------------------------------------------------------------------------

function camelToSnake(s) {
    return s.replace(/([A-Z])/g, m => '_' + m.toLowerCase());
}

/**
 * Recursively walk a TypeScript type node and return a descriptor:
 *   { pyType, isArray, converter, pattern }
 *
 * Transparently unwraps Promise<T>, Array<T>, and T[].
 */
function resolveReturnType(node, sf) {
    if (!node) return { pyType: 'Any', isArray: false, converter: null, pattern: 'raw' };

    switch (node.kind) {
        case ts.SyntaxKind.VoidKeyword:
            return { pyType: 'None', isArray: false, converter: null, pattern: 'void' };

        case ts.SyntaxKind.StringKeyword:
            return { pyType: 'str', isArray: false, converter: null, pattern: 'raw' };

        case ts.SyntaxKind.NumberKeyword:
            return { pyType: 'float', isArray: false, converter: null, pattern: 'raw' };

        case ts.SyntaxKind.BooleanKeyword:
            return { pyType: 'bool', isArray: false, converter: null, pattern: 'raw' };

        case ts.SyntaxKind.ArrayType: {
            // T[]
            const inner = resolveReturnType(node.elementType, sf);
            return { ...inner, isArray: true };
        }

        case ts.SyntaxKind.TypeReference: {
            const name = node.typeName.kind === ts.SyntaxKind.Identifier
                ? node.typeName.text
                : node.typeName.right.text;

            // Unwrap Promise<T>
            if (name === 'Promise' && node.typeArguments && node.typeArguments.length > 0) {
                return resolveReturnType(node.typeArguments[0], sf);
            }

            // Array<T>
            if (name === 'Array' && node.typeArguments && node.typeArguments.length > 0) {
                const inner = resolveReturnType(node.typeArguments[0], sf);
                return { ...inner, isArray: true };
            }

            // Known model type
            if (TYPE_MAP[name]) {
                const info = TYPE_MAP[name];
                return {
                    pyType: info.pyType,
                    isArray: false,
                    converter: info.converter,
                    pattern: info.pattern || 'single',
                };
            }

            // Scalar aliases
            if (name === 'string') return { pyType: 'str', isArray: false, converter: null, pattern: 'raw' };
            if (name === 'number') return { pyType: 'float', isArray: false, converter: null, pattern: 'raw' };
            if (name === 'boolean') return { pyType: 'bool', isArray: false, converter: null, pattern: 'raw' };
            if (name === 'Record') return { pyType: 'dict', isArray: false, converter: null, pattern: 'raw' };

            return { pyType: 'Any', isArray: false, converter: null, pattern: 'raw' };
        }

        case ts.SyntaxKind.UnionType: {
            const nonNull = node.types.filter(t =>
                t.kind !== ts.SyntaxKind.UndefinedKeyword &&
                t.kind !== ts.SyntaxKind.NullKeyword
            );
            if (nonNull.length === 1) return resolveReturnType(nonNull[0], sf);
            return { pyType: 'Any', isArray: false, converter: null, pattern: 'raw' };
        }

        default:
            return { pyType: 'Any', isArray: false, converter: null, pattern: 'raw' };
    }
}

/**
 * Given a method's return type node, compute the full { returnPy, pattern, converter }
 * config needed by generatePyMethod. This is the single source of truth — no manual
 * lookup table required.
 */
function inferReturnConfig(returnTypeNode, methodName, sf) {
    const resolved = resolveReturnType(returnTypeNode, sf);

    if (resolved.pattern === 'paginated') {
        return { returnPy: resolved.pyType, pattern: 'paginated', converter: null };
    }

    if (resolved.pattern === 'void') {
        return { returnPy: 'None', pattern: 'void', converter: null };
    }

    if (resolved.isArray) {
        if (!resolved.converter) {
            console.warn(`  WARNING: '${methodName}' returns an array of unknown type ('${resolved.pyType}[]'). Using raw pattern.`);
            return { returnPy: `List[${resolved.pyType}]`, pattern: 'raw', converter: null };
        }
        return { returnPy: `List[${resolved.pyType}]`, pattern: 'array', converter: resolved.converter };
    }

    if (resolved.pattern === 'single' && resolved.converter) {
        return { returnPy: resolved.pyType, pattern: 'single', converter: resolved.converter };
    }

    // Scalar or genuinely unknown
    return { returnPy: resolved.pyType, pattern: 'raw', converter: null };
}

/** Simplified typeNodeToPy for *parameter* types only (patterns not needed). */
function typeNodeToPy(node, sf) {
    if (!node) return 'Any';
    switch (node.kind) {
        case ts.SyntaxKind.StringKeyword: return 'str';
        case ts.SyntaxKind.NumberKeyword: return 'float';
        case ts.SyntaxKind.BooleanKeyword: return 'bool';
        case ts.SyntaxKind.VoidKeyword: return 'None';
        case ts.SyntaxKind.AnyKeyword: return 'Any';
        case ts.SyntaxKind.UndefinedKeyword: return 'Any';
        case ts.SyntaxKind.TypeLiteral: return 'dict';
        case ts.SyntaxKind.TypeReference: {
            const name = node.typeName.kind === ts.SyntaxKind.Identifier
                ? node.typeName.text
                : node.typeName.right.text;
            if (name === 'Promise' && node.typeArguments) return typeNodeToPy(node.typeArguments[0], sf);
            if (name === 'string') return 'str';
            if (name === 'number') return 'float';
            if (name === 'boolean') return 'bool';
            return 'dict';
        }
        case ts.SyntaxKind.UnionType: {
            const nonNull = node.types.filter(t =>
                t.kind !== ts.SyntaxKind.UndefinedKeyword &&
                t.kind !== ts.SyntaxKind.NullKeyword
            );
            if (nonNull.length === 1) return typeNodeToPy(nonNull[0], sf);
            return 'Any';
        }
        default: return 'dict';
    }
}

function isPublicMethod(node) {
    if (!node.modifiers) return true;
    for (const mod of node.modifiers) {
        if (
            mod.kind === ts.SyntaxKind.PrivateKeyword ||
            mod.kind === ts.SyntaxKind.ProtectedKeyword ||
            mod.kind === ts.SyntaxKind.AbstractKeyword
        ) return false;
    }
    return true;
}

function extractMethods(sourceFile) {
    const methods = [];

    function visitClass(classNode) {
        for (const member of classNode.members) {
            if (member.kind !== ts.SyntaxKind.MethodDeclaration) continue;
            if (!isPublicMethod(member)) continue;
            const name = member.name && member.name.kind === ts.SyntaxKind.Identifier
                ? member.name.text
                : null;
            if (!name) continue;
            if (SKIP_GENERATE.has(name)) continue;

            // Gate: only include methods whose return type we can fully resolve
            const config = inferReturnConfig(member.type, name, sourceFile);
            if (config.pattern === 'raw' && config.returnPy === 'Any') {
                console.warn(`  WARNING: '${name}' has an unrecognised return type — skipping. Add it to TYPE_MAP if needed.`);
                continue;
            }

            methods.push(member);
        }
    }

    function visit(node) {
        if (node.kind === ts.SyntaxKind.ClassDeclaration) {
            visitClass(node);
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return methods;
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

function buildPySignatureParams(params, sf) {
    return params.map(p => {
        const tsName = p.name.getText(sf);
        const snakeName = camelToSnake(tsName);
        const isOptional = !!p.questionToken;
        const typeStr = p.type ? typeNodeToPy(p.type, sf) : 'Any';
        if (isOptional) return `${snakeName}: Optional[${typeStr}] = None`;
        return `${snakeName}: ${typeStr}`;
    }).join(', ');
}

function buildPyArgsLines(params, sf) {
    const lines = [];
    for (const p of params) {
        const tsName = p.name.getText(sf);
        const snakeName = camelToSnake(tsName);
        if (p.questionToken) {
            lines.push(`            if ${snakeName} is not None:`);
            lines.push(`                args.append(${snakeName})`);
        } else {
            lines.push(`            args.append(${snakeName})`);
        }
    }
    return lines.join('\n');
}

function buildPyReturnLines(config) {
    const { pattern, converter } = config;
    const i = '            ';
    switch (pattern) {
        case 'array':
            return (
                `${i}data = self._handle_response(json.loads(response.data))\n` +
                `${i}return [${converter}(e) for e in data]`
            );
        case 'single':
            return (
                `${i}data = self._handle_response(json.loads(response.data))\n` +
                `${i}return ${converter}(data)`
            );
        case 'paginated':
            return [
                `${i}data = self._handle_response(json.loads(response.data))`,
                `${i}return PaginatedMarketsResult(`,
                `${i}    data=[_convert_market(m) for m in data.get("data", [])],`,
                `${i}    total=data.get("total", 0),`,
                `${i}    next_cursor=data.get("nextCursor"),`,
                `${i})`,
            ].join('\n');
        case 'void':
            return `${i}self._handle_response(json.loads(response.data))`;
        default:
            return `${i}data = self._handle_response(json.loads(response.data))\n${i}return data`;
    }
}

function generatePyMethod(name, params, config, sf) {
    const snakeName = camelToSnake(name);
    const paramSig = buildPySignatureParams(params, sf);
    const hasParams = params.some(p => camelToSnake(p.name.getText(sf)) === 'params');
    const selfSigParams = paramSig ? `, ${paramSig}` : '';
    // Methods with a 'params' dict also accept **kwargs so callers can pass
    // individual fields (e.g. fetch_events(limit=5) instead of fetch_events({'limit': 5}))
    const selfSig = hasParams ? `${selfSigParams}, **kwargs` : selfSigParams;
    const { returnPy } = config;
    const argsLines = buildPyArgsLines(params, sf);

    let injectedKwargsBlock = '';
    if (hasParams) {
        injectedKwargsBlock = `\n            if kwargs:\n                params = {**(params or {}), **kwargs}`;
    }
    const argsBlock = argsLines ? `${injectedKwargsBlock}\n${argsLines}` : '';
    const returnLines = buildPyReturnLines(config);

    return [
        `    def ${snakeName}(self${selfSig}) -> ${returnPy}:`,
        `        try:`,
        `            args = []${argsBlock}`,
        `            body: dict = {"args": args}`,
        `            creds = self._get_credentials_dict()`,
        `            if creds:`,
        `                body["credentials"] = creds`,
        `            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/${name}"`,
        `            headers = {"Content-Type": "application/json", "Accept": "application/json"}`,
        `            headers.update(self._get_auth_headers())`,
        `            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)`,
        `            response.read()`,
        returnLines,
        `        except Exception as e:`,
        `            raise Exception(f"Failed to ${snakeName}: {self._extract_api_error(e)}") from None`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const source = fs.readFileSync(BASE_EXCHANGE_PATH, 'utf-8');
    const sf = ts.createSourceFile('BaseExchange.ts', source, ts.ScriptTarget.ES2022, true);

    const methods = extractMethods(sf);

    const generated = methods.map(m => {
        const name = m.name.text;
        const config = inferReturnConfig(m.type, name, sf);
        return generatePyMethod(name, m.parameters, config, sf);
    }).join('\n\n');

    let client = fs.readFileSync(CLIENT_PATH, 'utf-8');

    const beginIdx = client.indexOf(MARKER_BEGIN);
    const endIdx = client.indexOf(MARKER_END);

    if (beginIdx === -1 || endIdx === -1) {
        throw new Error(
            `Generation markers not found in ${CLIENT_PATH}.\n` +
            `Add:\n  ${MARKER_BEGIN}\n  ${MARKER_END}`
        );
    }

    const before = client.slice(0, beginIdx + MARKER_BEGIN.length);
    const after = client.slice(endIdx);

    client = `${before}\n\n${generated}\n\n${after}`;

    fs.writeFileSync(CLIENT_PATH, client, 'utf-8');

    console.log(`Generated ${methods.length} methods in client.py:`);
    for (const m of methods) {
        const config = inferReturnConfig(m.type, m.name.text, sf);
        console.log(`  + ${m.name.text} -> ${config.returnPy} [${config.pattern}]`);
    }
}

main();
