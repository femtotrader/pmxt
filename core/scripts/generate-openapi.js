'use strict';

/**
 * Generates openapi.yaml from BaseExchange.ts using the TypeScript compiler AST.
 * Run: node core/scripts/generate-openapi.js
 * Adding a public method to BaseExchange.ts is sufficient to include it in the spec.
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BASE_EXCHANGE_PATH = path.join(__dirname, '../src/BaseExchange.ts');
const APP_TS_PATH = path.join(__dirname, '../src/server/app.ts');
const OPENAPI_OUT_PATH = path.join(__dirname, '../src/server/openapi.yaml');
// Sidecar metadata consumed by the runtime server (app.ts) so the GET
// handler knows which methods are safe to expose as GET and how to
// translate query parameters into the positional `args` array that
// exchange methods expect.
const METHOD_VERBS_OUT_PATH = path.join(
    __dirname,
    '../src/server/method-verbs.json'
);

const EXCLUDED_METHODS = new Set(['callApi', 'defineImplicitApi']);

// Map TypeScript type names to OpenAPI component schema names
const TYPE_REF_MAP = {
  UnifiedMarket: 'UnifiedMarket',
  UnifiedEvent: 'UnifiedEvent',
  MarketOutcome: 'MarketOutcome',
  Order: 'Order',
  Trade: 'Trade',
  UserTrade: 'UserTrade',
  Position: 'Position',
  Balance: 'Balance',
  PriceCandle: 'PriceCandle',
  OrderBook: 'OrderBook',
  OrderLevel: 'OrderLevel',
  ExecutionPriceResult: 'ExecutionPriceResult',
  PaginatedMarketsResult: 'PaginatedMarketsResult',
  // MarketFetchParams is an alias for MarketFilterParams
  MarketFetchParams: 'MarketFilterParams',
  MarketFilterParams: 'MarketFilterParams',
  EventFetchParams: 'EventFetchParams',
  OHLCVParams: 'OHLCVParams',
  HistoryFilterParams: 'HistoryFilterParams',
  TradesParams: 'TradesParams',
  CreateOrderParams: 'CreateOrderParams',
  MyTradesParams: 'MyTradesParams',
  OrderHistoryParams: 'OrderHistoryParams',
  BuiltOrder: 'BuiltOrder',
};

// ---------------------------------------------------------------------------
// Type node → OpenAPI schema
// ---------------------------------------------------------------------------

function typeNodeToSchema(node, sourceFile) {
  if (!node) return {};

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' };
    // `any` / `unknown` mean "anything" — express as an empty schema,
    // which is the OpenAPI idiom. Used by e.g. BuiltOrder.raw.
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
      return {};
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
      return null;

    case ts.SyntaxKind.ArrayType: {
      const items = typeNodeToSchema(node.elementType, sourceFile);
      return { type: 'array', items: items || {} };
    }

    case ts.SyntaxKind.TypeReference: {
      const typeName = node.typeName;
      const name =
        typeName.kind === ts.SyntaxKind.Identifier
          ? typeName.text
          : typeName.right.text; // QualifiedName: take the rightmost part

      if (name === 'Promise') {
        const arg = node.typeArguments && node.typeArguments[0];
        return typeNodeToSchema(arg, sourceFile);
      }

      if (name === 'Record') {
        const valTypeNode = node.typeArguments && node.typeArguments[1];
        const valSchema = typeNodeToSchema(valTypeNode, sourceFile);
        // Permissive object: any key, any value (for Record<string, any>
        // valSchema is {} which OpenAPI treats as "any value").
        return {
          type: 'object',
          additionalProperties: valSchema == null ? {} : valSchema,
        };
      }

      // Built-in `Date` → OpenAPI date-time string. TS interfaces use
      // `Date` for wall-clock fields (resolutionDate, since, until, ...);
      // on the wire they're serialised to ISO-8601 strings.
      if (name === 'Date') {
        return { type: 'string', format: 'date-time' };
      }

      if (TYPE_REF_MAP[name]) {
        return { $ref: `#/components/schemas/${TYPE_REF_MAP[name]}` };
      }

      // Type alias (e.g. `export type CandleInterval = '1m' | '5m' | ...`).
      // Resolve by recursing into the aliased type node. We don't emit
      // these as component schemas because they're primitive unions,
      // not object shapes — inlining gives much better docs (the docs
      // show the enum values directly instead of a $ref).
      const alias = TYPE_ALIAS_REGISTRY.get(name);
      if (alias) {
        return typeNodeToSchema(alias.typeNode, alias.sourceFile);
      }

      // Unknown type reference — approximate as generic object
      return { type: 'object' };
    }

    case ts.SyntaxKind.UnionType: {
      const members = node.types;
      const nonNull = members.filter(
        t =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      );

      if (nonNull.length === 0) return null;

      // All string literals → enum
      if (
        nonNull.every(
          t =>
            t.kind === ts.SyntaxKind.LiteralType &&
            t.literal.kind === ts.SyntaxKind.StringLiteral
        )
      ) {
        return { type: 'string', enum: nonNull.map(t => t.literal.text) };
      }

      if (nonNull.length === 1) return typeNodeToSchema(nonNull[0], sourceFile);

      const schemas = nonNull
        .map(t => typeNodeToSchema(t, sourceFile))
        .filter(s => s !== null);
      if (schemas.length === 0) return null;
      if (schemas.length === 1) return schemas[0];
      return { oneOf: schemas };
    }

    case ts.SyntaxKind.LiteralType: {
      const lit = node.literal;
      if (lit.kind === ts.SyntaxKind.StringLiteral) {
        return { type: 'string', enum: [lit.text] };
      }
      if (lit.kind === ts.SyntaxKind.NumericLiteral) {
        return { type: 'number' };
      }
      if (
        lit.kind === ts.SyntaxKind.TrueKeyword ||
        lit.kind === ts.SyntaxKind.FalseKeyword
      ) {
        return { type: 'boolean' };
      }
      return {};
    }

    case ts.SyntaxKind.TypeLiteral: {
      // Inline object type: { key?: T; ... }
      const properties = {};
      const requiredProps = [];
      for (const member of node.members) {
        if (member.kind !== ts.SyntaxKind.PropertySignature || !member.name) {
          continue;
        }
        let propName;
        if (member.name.kind === ts.SyntaxKind.Identifier) {
          propName = member.name.text;
        } else if (member.name.kind === ts.SyntaxKind.StringLiteral) {
          propName = member.name.text;
        } else {
          continue; // Skip computed property names
        }
        const isOptional = !!member.questionToken;
        const propSchema = typeNodeToSchema(member.type, sourceFile);
        if (propSchema !== null) {
          properties[propName] = propSchema;
          if (!isOptional) requiredProps.push(propName);
        }
      }
      const result = { type: 'object', properties };
      if (requiredProps.length > 0) result.required = requiredProps;
      return result;
    }

    case ts.SyntaxKind.FunctionType:
    case ts.SyntaxKind.ConstructorType:
      // Function types can't cross an HTTP boundary; approximate as object
      return { type: 'object' };

    case ts.SyntaxKind.ParenthesizedType:
      return typeNodeToSchema(node.type, sourceFile);

    default:
      return { type: 'object' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function camelToTitle(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function getJSDocDescription(node, sourceFile) {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (!ranges || ranges.length === 0) return null;

  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const text = sourceFile.text.slice(r.pos, r.end);
    if (!text.startsWith('/**')) continue;

    // Strip /** ... */ and leading " * " on each line
    const inner = text.slice(3, -2);
    const lines = inner
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trimEnd());

    // Collect lines until we hit a @tag
    const descLines = [];
    for (const line of lines) {
      if (line.trimStart().startsWith('@')) break;
      descLines.push(line);
    }

    const description = descLines
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return description || null;
  }
  return null;
}

function isPublicMethod(node) {
  if (!node.modifiers) return true;
  for (const mod of node.modifiers) {
    if (
      mod.kind === ts.SyntaxKind.PrivateKeyword ||
      mod.kind === ts.SyntaxKind.ProtectedKeyword ||
      mod.kind === ts.SyntaxKind.AbstractKeyword
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Verb classification + per-parameter metadata
//
// Methods whose name starts with `fetch` are exposed as **GET** on the
// HTTP surface (idempotent, cacheable, browser-native). Everything else —
// writes (`createOrder`, `cancelOrder`, ...), loaders (`loadMarkets`),
// lifecycle (`close`), realtime (`watch*`, `unwatch*`), and in-memory
// utilities (`filterMarkets`, `getExecutionPrice*`) — stays as **POST**
// because they either mutate state, carry credentials in the body, or
// take structural arguments that don't fit cleanly in a query string.
//
// A method is GET-eligible if its signature fits the shape
// `[primitive..., object?]`: any number of primitive args (routed by
// name in the query string), optionally followed by a single object arg
// whose remaining properties also travel as query params. The server's
// `queryToArgs` reserves primitive arg names and spreads everything
// else into the object slot, so this shape round-trips cleanly. Methods
// with more than one object arg, or with unknown parameter kinds, stay
// POST.
// ---------------------------------------------------------------------------

function paramKind(typeNode) {
  if (!typeNode) return 'unknown';
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return 'string';
    case ts.SyntaxKind.NumberKeyword:
      return 'number';
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean';
    case ts.SyntaxKind.TypeReference:
    case ts.SyntaxKind.TypeLiteral:
      return 'object';
    case ts.SyntaxKind.UnionType: {
      // Allow unions of named object types as object-kind (fetchTrades
      // takes `TradesParams | HistoryFilterParams`, etc.). Reject other
      // unions as unknown so we fall back to POST.
      const members = typeNode.types.filter(
        t =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      );
      if (members.every(t => t.kind === ts.SyntaxKind.TypeReference)) {
        return 'object';
      }
      return 'unknown';
    }
    default:
      return 'unknown';
  }
}

function paramTypeName(typeNode) {
  if (!typeNode) return null;
  if (typeNode.kind === ts.SyntaxKind.TypeReference) {
    const tn = typeNode.typeName;
    return tn.kind === ts.SyntaxKind.Identifier ? tn.text : tn.right.text;
  }
  if (typeNode.kind === ts.SyntaxKind.UnionType) {
    // Pick the first named type in a union for property enumeration.
    for (const t of typeNode.types) {
      if (t.kind === ts.SyntaxKind.TypeReference) {
        const tn = t.typeName;
        return tn.kind === ts.SyntaxKind.Identifier ? tn.text : tn.right.text;
      }
    }
  }
  return null;
}

function extractParamMeta(method) {
  return method.parameters.map(p => {
    const name =
      p.name && p.name.kind === ts.SyntaxKind.Identifier ? p.name.text : 'arg';
    const optional = !!p.questionToken || !!p.initializer;
    const kind = paramKind(p.type);
    const typeName = paramTypeName(p.type);
    return { name, optional, kind, typeName };
  });
}

function classifyVerb(methodName, paramsMeta) {
  if (!methodName.startsWith('fetch')) return 'post';
  if (paramsMeta.length === 0) return 'get';
  // Reject unknown kinds outright — we can't safely serialise them.
  const isPrimitive = k =>
    k === 'string' || k === 'number' || k === 'boolean';
  if (!paramsMeta.every(p => isPrimitive(p.kind) || p.kind === 'object')) {
    return 'post';
  }
  // At most one object arg. `queryToArgs` reserves primitive arg names
  // and spreads the rest of the query string into the object slot, so
  // `(id: string, params: object)` shapes round-trip cleanly.
  const objectCount = paramsMeta.filter(p => p.kind === 'object').length;
  if (objectCount > 1) return 'post';
  return 'get';
}

// Expand an object-typed parameter into a list of query parameter
// definitions. We look up the named type in our static SCHEMAS map; for
// inline type literals we walk the AST members directly.
function expandObjectParamToQuery(param, methodParam, sourceFile) {
  const queryParams = [];

  // Named type — enumerate from SCHEMAS
  if (param.typeName) {
    const schemaName = TYPE_REF_MAP[param.typeName] || param.typeName;
    const schema = SCHEMAS[schemaName];
    if (schema && schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        // Hoist description to the parameter level (canonical OpenAPI location)
        // and strip it from the inner schema to avoid duplication.
        const { description, ...schemaWithoutDesc } = propSchema;
        const qp = {
          in: 'query',
          name: propName,
          required: false,
          schema: schemaWithoutDesc,
        };
        if (description) qp.description = description;
        queryParams.push(qp);
      }
      return queryParams;
    }
  }

  // Inline object type — walk the TypeLiteral members
  if (
    methodParam.type &&
    methodParam.type.kind === ts.SyntaxKind.TypeLiteral
  ) {
    for (const member of methodParam.type.members) {
      if (
        member.kind !== ts.SyntaxKind.PropertySignature ||
        !member.name ||
        member.name.kind !== ts.SyntaxKind.Identifier
      ) {
        continue;
      }
      const propSchema = typeNodeToSchema(member.type, sourceFile) || {
        type: 'string',
      };
      queryParams.push({
        in: 'query',
        name: member.name.text,
        required: !member.questionToken,
        schema: propSchema,
      });
    }
  }

  return queryParams;
}

// ---------------------------------------------------------------------------
// Build a single OpenAPI path entry from a MethodDeclaration node
// ---------------------------------------------------------------------------

function buildPathSpec(method, sourceFile) {
  const name = method.name.text;
  const params = method.parameters;
  const paramsMeta = extractParamMeta(method);
  const verb = classifyVerb(name, paramsMeta);

  let requiredCount = 0;
  for (const p of params) {
    if (!p.questionToken && !p.initializer) requiredCount++;
  }
  const totalCount = params.length;

  // Build the response schema from the return type
  const returnSchema = method.type ? typeNodeToSchema(method.type, sourceFile) : null;

  let responseSchema;
  if (returnSchema === null) {
    responseSchema = { $ref: '#/components/schemas/BaseResponse' };
  } else {
    responseSchema = {
      allOf: [
        { $ref: '#/components/schemas/BaseResponse' },
        { type: 'object', properties: { data: returnSchema } },
      ],
    };
  }

  const description = getJSDocDescription(method, sourceFile);
  const summary = camelToTitle(name);

  // ---- GET: query-parameter shape, no request body ----------------------
  if (verb === 'get') {
    const parameters = [{ $ref: '#/components/parameters/ExchangeParam' }];

    // Emit each param in order: primitives become flat query params
    // named after the TS arg; object params get their properties
    // expanded into flat query params via the SCHEMAS lookup. This
    // handles both shapes we care about: a single object arg
    // (fetchMarkets(params)) and mixed `[primitive..., object]` shapes
    // (fetchOHLCV(id, params)). Without the expansion the object arg
    // would render as a meaningless `params: string` field in the docs.
    for (let i = 0; i < paramsMeta.length; i++) {
      const pm = paramsMeta[i];
      if (pm.kind === 'object') {
        parameters.push(
          ...expandObjectParamToQuery(pm, params[i], sourceFile)
        );
        continue;
      }
      parameters.push({
        in: 'query',
        name: pm.name,
        required: !pm.optional,
        schema: {
          type:
            pm.kind === 'number'
              ? 'number'
              : pm.kind === 'boolean'
              ? 'boolean'
              : 'string',
        },
      });
    }

    const pathObj = {
      get: {
        summary,
        operationId: name,
        parameters,
        responses: {
          '200': {
            description: `${summary} response`,
            content: {
              'application/json': { schema: responseSchema },
            },
          },
        },
      },
    };
    if (description) pathObj.get.description = description;
    return { name, pathObj, verb, paramsMeta };
  }

  // ---- POST: existing args/credentials request-body shape ---------------
  let argsSchema;
  if (totalCount === 0) {
    argsSchema = { type: 'array', maxItems: 0, items: {} };
  } else if (totalCount === 1) {
    const p = params[0];
    const itemSchema = typeNodeToSchema(p.type, sourceFile) || {};
    argsSchema = { type: 'array', maxItems: 1, items: itemSchema };
    if (requiredCount === 1) argsSchema.minItems = 1;
  } else {
    const itemSchemas = params.map(p => typeNodeToSchema(p.type, sourceFile) || {});
    // Flatten nested oneOfs — openapi-generator-cli produces broken TS
    // output for anonymous nested oneOf schemas (missing `instanceOf*`
    // type guards for the inner variants). A flat union is semantically
    // equivalent here since `items` applies to every tuple position.
    const flattened = [];
    for (const s of itemSchemas) {
      if (s && Array.isArray(s.oneOf) && Object.keys(s).length === 1) {
        flattened.push(...s.oneOf);
      } else {
        flattened.push(s);
      }
    }
    argsSchema = {
      type: 'array',
      minItems: requiredCount,
      maxItems: totalCount,
      items: { oneOf: flattened },
    };
  }

  const requestBodySchema = {
    title: name.charAt(0).toUpperCase() + name.slice(1) + 'Request',
    type: 'object',
    properties: {
      args: argsSchema,
      credentials: { $ref: '#/components/schemas/ExchangeCredentials' },
    },
  };
  if (requiredCount > 0) {
    requestBodySchema.required = ['args'];
  }

  const pathObj = {
    post: {
      summary,
      operationId: name,
      parameters: [{ $ref: '#/components/parameters/ExchangeParam' }],
      requestBody: {
        content: {
          'application/json': { schema: requestBodySchema },
        },
      },
      responses: {
        '200': {
          description: `${summary} response`,
          content: {
            'application/json': { schema: responseSchema },
          },
        },
      },
    },
  };

  if (description) {
    pathObj.post.description = description;
  }

  return { name, pathObj, verb, paramsMeta };
}

// ---------------------------------------------------------------------------
// Parse BaseExchange.ts and extract public MethodDeclaration nodes
// ---------------------------------------------------------------------------

function extractMethods(sourceFile) {
  const methods = [];

  function visitClass(classNode) {
    for (const member of classNode.members) {
      if (member.kind !== ts.SyntaxKind.MethodDeclaration) continue;
      if (!isPublicMethod(member)) continue;

      const name =
        member.name && member.name.kind === ts.SyntaxKind.Identifier
          ? member.name.text
          : null;
      if (!name) continue;
      if (EXCLUDED_METHODS.has(name)) continue;

      methods.push(member);
    }
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
      visitClass(node);
      return; // Don't descend into nested classes
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return methods;
}

// ---------------------------------------------------------------------------
// Component schemas
//
// Everything that corresponds to a TypeScript interface in the core
// source files is AST-derived: we walk the interface's PropertySignature
// members and emit a JSON schema with per-property descriptions pulled
// from JSDoc (/** ... */) blocks or trailing `//` line comments. This
// replaces the hand-maintained SCHEMAS literal that previously shipped
// here — that literal silently drifted from types.ts every time a new
// field was added (most of them) or a description was tweaked (all of
// them), which surfaced in Mintlify as undocumented params.
//
// Only wire envelopes (BaseResponse, ErrorDetail, BaseRequest,
// ErrorResponse) stay hardcoded: they describe the JSON shape the
// server wraps every call in, and have no 1:1 TS counterpart.
// ---------------------------------------------------------------------------

const SOURCE_FILES = [
  path.join(__dirname, '../src/BaseExchange.ts'),
  path.join(__dirname, '../src/types.ts'),
  path.join(__dirname, '../src/utils/math.ts'),
];

const STATIC_SCHEMAS = {
  BaseResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  },
  ErrorDetail: {
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
  },
  BaseRequest: {
    type: 'object',
    description: 'Base request structure with optional credentials',
    properties: {
      credentials: { $ref: '#/components/schemas/ExchangeCredentials' },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  },
};

// Order in which AST-derived schemas are emitted. Matches the grouping
// the hand-maintained literal used, purely so diffs stay readable.
const GENERATED_SCHEMA_ORDER = [
  // Core data models
  'UnifiedMarket',
  'MarketOutcome',
  'UnifiedEvent',
  'PriceCandle',
  'OrderBook',
  'OrderLevel',
  'Trade',
  'UserTrade',
  // Trading data models
  'Order',
  'Position',
  'Balance',
  'ExecutionPriceResult',
  'PaginatedMarketsResult',
  // Input parameter schemas
  'MarketFilterParams',
  'EventFetchParams',
  'HistoryFilterParams',
  'OHLCVParams',
  'TradesParams',
  'CreateOrderParams',
  'BuiltOrder',
  'MyTradesParams',
  'OrderHistoryParams',
  // Auth
  'ExchangeCredentials',
];

// Look up a property description: prefer a leading JSDoc `/** ... */`
// block, fall back to a trailing `// ...` line comment on the same
// line. Most BaseExchange.ts param interfaces use the trailing style;
// most types.ts fields use JSDoc. Both flow through.
function getPropertyDescription(member, sourceFile) {
  const jsdoc = getJSDocDescription(member, sourceFile);
  if (jsdoc) return jsdoc;

  const trailing = ts.getTrailingCommentRanges(sourceFile.text, member.end);
  if (trailing && trailing.length > 0) {
    const r = trailing[0];
    const text = sourceFile.text.slice(r.pos, r.end);
    if (text.startsWith('//')) {
      return text.slice(2).trim() || null;
    }
    if (text.startsWith('/*') && text.endsWith('*/')) {
      return text.slice(2, -2).trim() || null;
    }
  }
  return null;
}

// Module-level type alias map. Populated by buildInterfaceRegistry().
// Accessed by typeNodeToSchema when it encounters a TypeReference whose
// name isn't a known interface in TYPE_REF_MAP — e.g. `CandleInterval`
// which is `'1m' | '5m' | '15m' | '1h' | '6h' | '1d'`.
const TYPE_ALIAS_REGISTRY = new Map();

// Parse every source file once up front. Index InterfaceDeclarations
// by name for buildInterfaceSchema, and index TypeAliasDeclarations
// (e.g. `type CandleInterval = '1m' | ...`) for typeNodeToSchema to
// resolve inline.
function buildInterfaceRegistry() {
  const registry = new Map();
  TYPE_ALIAS_REGISTRY.clear();
  for (const filePath of SOURCE_FILES) {
    const src = fs.readFileSync(filePath, 'utf-8');
    const sf = ts.createSourceFile(
      path.basename(filePath),
      src,
      ts.ScriptTarget.ES2022,
      /* setParentNodes */ true
    );
    ts.forEachChild(sf, function visit(node) {
      if (node.kind === ts.SyntaxKind.InterfaceDeclaration && node.name) {
        registry.set(node.name.text, { node, sourceFile: sf });
      } else if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && node.name) {
        TYPE_ALIAS_REGISTRY.set(node.name.text, {
          typeNode: node.type,
          sourceFile: sf,
        });
      }
      // Interfaces in pmxt-core are all top-level exports, so no need
      // to recurse into namespaces / modules here.
    });
  }
  return registry;
}

// Build a JSON schema from a TS interface by walking its members.
// Handles `extends` by recursively merging parent properties, and
// emits `required` from the absence of question tokens.
function buildInterfaceSchema(interfaceName, registry, visiting = new Set()) {
  if (visiting.has(interfaceName)) return null; // cycle guard
  const entry = registry.get(interfaceName);
  if (!entry) return null;
  visiting.add(interfaceName);

  const { node, sourceFile } = entry;
  const properties = {};
  const required = [];

  // Merge parent interfaces first so child members can override.
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const expr of clause.types) {
        if (!expr.expression || expr.expression.kind !== ts.SyntaxKind.Identifier) {
          continue;
        }
        const parentName = expr.expression.text;
        const parentSchema = buildInterfaceSchema(parentName, registry, visiting);
        if (parentSchema && parentSchema.properties) {
          Object.assign(properties, parentSchema.properties);
          if (Array.isArray(parentSchema.required)) {
            for (const r of parentSchema.required) {
              if (!required.includes(r)) required.push(r);
            }
          }
        }
      }
    }
  }

  for (const member of node.members) {
    if (member.kind !== ts.SyntaxKind.PropertySignature || !member.name) continue;
    let propName;
    if (member.name.kind === ts.SyntaxKind.Identifier) {
      propName = member.name.text;
    } else if (member.name.kind === ts.SyntaxKind.StringLiteral) {
      propName = member.name.text;
    } else {
      continue;
    }

    const isOptional = !!member.questionToken;
    let propSchema = typeNodeToSchema(member.type, sourceFile);
    if (propSchema === null) continue;

    const description = getPropertyDescription(member, sourceFile);
    if (description) {
      if (propSchema.$ref) {
        // OpenAPI 3.0: sibling keys of $ref are ignored, so wrap in allOf
        propSchema = { allOf: [propSchema], description };
      } else if (!propSchema.description) {
        propSchema.description = description;
      }
    }

    properties[propName] = propSchema;

    if (isOptional) {
      const idx = required.indexOf(propName);
      if (idx >= 0) required.splice(idx, 1);
    } else if (!required.includes(propName)) {
      required.push(propName);
    }
  }

  visiting.delete(interfaceName);

  const schema = { type: 'object' };
  // Interface-level JSDoc becomes the schema description.
  const interfaceDesc = getJSDocDescription(node, sourceFile);
  if (interfaceDesc) schema.description = interfaceDesc;
  schema.properties = properties;
  if (required.length > 0) schema.required = required;
  return schema;
}

function buildAllSchemas(registry) {
  const schemas = { ...STATIC_SCHEMAS };
  for (const interfaceName of GENERATED_SCHEMA_ORDER) {
    const schema = buildInterfaceSchema(interfaceName, registry);
    if (!schema) {
      throw new Error(
        `[generate-openapi] Failed to locate interface "${interfaceName}" ` +
          `in any of: ${SOURCE_FILES.map(f => path.basename(f)).join(', ')}. ` +
          `Either the interface was renamed/moved or SOURCE_FILES needs ` +
          `an additional entry.`
      );
    }
    schemas[interfaceName] = schema;
  }
  return schemas;
}

// Placeholder — replaced by buildAllSchemas() at runtime. Left in place
// so the rest of the file can keep referring to `SCHEMAS` while we
// transition; main() populates it before any consumer runs.
let SCHEMAS = { ...STATIC_SCHEMAS };


// ---------------------------------------------------------------------------
// Assemble and write the full spec
// ---------------------------------------------------------------------------

function buildSpec(methodSpecs) {
  const paths = {};

  // Static health endpoint
  paths['/health'] = {
    get: {
      summary: 'Server Health Check',
      operationId: 'healthCheck',
      responses: {
        '200': {
          description: 'Server is consistent and running.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'integer', format: 'int64' },
                },
              },
            },
          },
        },
      },
    },
  };

  for (const { name, pathObj } of methodSpecs) {
    paths[`/api/{exchange}/${name}`] = pathObj;
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'PMXT Sidecar API',
      description:
        'A unified local sidecar API for prediction markets (Polymarket, Kalshi, Limitless). ' +
        'This API acts as a JSON-RPC-style gateway. Each endpoint corresponds to a specific method ' +
        'on the generic exchange implementation.',
      version: '0.4.4',
    },
    servers: [
      { url: 'http://localhost:3847', description: 'Local development server' },
    ],
    paths,
    components: {
      parameters: {
        ExchangeParam: {
          in: 'path',
          name: 'exchange',
          schema: {
            type: 'string',
            enum: ['polymarket', 'kalshi', 'kalshi-demo', 'limitless', 'probable', 'baozi', 'myriad', 'opinion', 'metaculus', 'smarkets', 'polymarket_us'],
          },
          required: true,
          description: 'The prediction market exchange to target.',
        },
      },
      schemas: SCHEMAS,
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime sidecar: method name → verb + arg spec
//
// The generated OpenAPI spec is the public contract, but app.ts needs
// a lean, O(1)-lookup form of the same info to drive its GET dispatch
// at runtime. We emit it as plain JSON (no yaml parser required in the
// server) next to openapi.yaml, so `npm run build` copies both into
// dist/server/ in a single `cp` line.
// ---------------------------------------------------------------------------

function buildMethodVerbs(methodSpecs) {
  const out = {};
  for (const { name, verb, paramsMeta } of methodSpecs) {
    out[name] = {
      verb,
      args: paramsMeta.map(p => ({
        name: p.name,
        kind: p.kind,
        optional: p.optional,
      })),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exchange constructor metadata (x-sdk-constructors)
//
// Parses createExchange() in app.ts to discover which exchanges exist and
// which credentials each one requires — the same logic used by
// generate-python-exchanges.js. The result is attached to the OpenAPI spec
// as the `x-sdk-constructors` vendor extension so downstream consumers
// (e.g. Mintlify docs sync) can auto-generate per-exchange SDK samples.
// ---------------------------------------------------------------------------

// Overrides that cannot be derived from app.ts alone.
const EXCHANGE_OVERRIDES = {
    polymarket: {
        defaults: { signature_type: 'gnosis-safe' },
    },
    myriad: {
        paramAliases: { private_key: 'wallet_address' },
        paramDocs: {
            wallet_address: 'Wallet address (required for positions and balance)',
        },
    },
};

function toClassName(name) {
    return name
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function parseExchanges(content) {
    const startIdx = content.indexOf('function createExchange(');
    if (startIdx === -1) throw new Error('createExchange not found in app.ts');

    const tail = content.slice(startIdx);
    let depth = 0;
    let bodyEnd = 0;
    for (let i = tail.indexOf('{'); i < tail.length; i++) {
        if (tail[i] === '{') depth++;
        else if (tail[i] === '}') {
            depth--;
            if (depth === 0) { bodyEnd = i + 1; break; }
        }
    }
    const funcBody = tail.slice(0, bodyEnd);

    const exchanges = [];
    const lines = funcBody.split('\n');
    let currentName = null;
    let currentBlock = '';

    for (const line of lines) {
        const caseMatch = line.match(/^\s*case "([^"]+)":/);
        if (caseMatch) {
            if (currentName) exchanges.push(buildExchange(currentName, currentBlock));
            currentName = caseMatch[1];
            currentBlock = '';
            continue;
        }
        if (/^\s*default:/.test(line) && currentName) {
            exchanges.push(buildExchange(currentName, currentBlock));
            currentName = null;
            currentBlock = '';
            continue;
        }
        if (currentName) currentBlock += line + '\n';
    }
    if (currentName) exchanges.push(buildExchange(currentName, currentBlock));

    return exchanges;
}

function buildExchange(name, block) {
    return {
        name,
        creds: {
            apiKey:        /credentials\?\.apiKey/.test(block),
            apiToken:      /credentials\?\.apiToken/.test(block),
            apiSecret:     /credentials\?\.apiSecret/.test(block),
            passphrase:    /credentials\?\.passphrase/.test(block),
            privateKey:    /credentials\?\.privateKey/.test(block),
            funderAddress: /credentials\?\.funderAddress/.test(block),
            signatureType: /credentials\?\.signatureType/.test(block),
        },
    };
}

// Credential flag → default param metadata
const CRED_PARAM_MAP = {
    apiKey:        { name: 'api_key',        tsName: 'apiKey',        description: 'API key for authentication' },
    apiToken:      { name: 'api_token',      tsName: 'apiToken',      description: 'API token for authentication' },
    apiSecret:     { name: 'api_secret',     tsName: 'apiSecret',     description: 'API secret for authentication' },
    passphrase:    { name: 'passphrase',     tsName: 'passphrase',    description: 'Passphrase for authentication' },
    privateKey:    { name: 'private_key',    tsName: 'privateKey',    description: 'Private key for authentication' },
    funderAddress: { name: 'proxy_address',  tsName: 'proxyAddress',  description: 'Proxy/smart wallet address' },
    signatureType: { name: 'signature_type', tsName: 'signatureType', description: 'Signature type' },
};

function camelCase(snakeName) {
    return snakeName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function buildSdkConstructors(exchanges) {
    const result = {};

    for (const exchange of exchanges) {
        const { name, creds } = exchange;
        const ov = EXCHANGE_OVERRIDES[name] || {};
        const aliases = ov.paramAliases || {};
        const defaults = ov.defaults || {};
        const paramDocs = ov.paramDocs || {};

        // Every exchange gets the hosted API key param first
        const params = [
            {
                name: 'pmxt_api_key',
                tsName: 'pmxtApiKey',
                type: 'string',
                description: 'PMXT API key for hosted access',
            },
        ];

        for (const [credFlag, baseMeta] of Object.entries(CRED_PARAM_MAP)) {
            if (!creds[credFlag]) continue;

            const aliasedSnakeName = aliases[baseMeta.name] || baseMeta.name;
            const aliasedTsName = camelCase(aliasedSnakeName);
            const description = paramDocs[aliasedSnakeName] || baseMeta.description;

            const param = {
                name: aliasedSnakeName,
                tsName: aliasedTsName,
                type: 'string',
                description,
            };

            const defaultVal = defaults[baseMeta.name];
            if (defaultVal) {
                param.default = defaultVal;
            }

            params.push(param);
        }

        result[name] = {
            className: toClassName(name),
            params,
        };
    }

    return result;
}

function main() {
  // Build the interface registry and the full component-schema map
  // FIRST. `buildPathSpec` below consults the global SCHEMAS map via
  // `expandObjectParamToQuery` to flatten object-typed query params,
  // so the schemas have to exist before any path is built.
  const registry = buildInterfaceRegistry();
  SCHEMAS = buildAllSchemas(registry);

  const source = fs.readFileSync(BASE_EXCHANGE_PATH, 'utf-8');
  const sourceFile = ts.createSourceFile(
    'BaseExchange.ts',
    source,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true
  );

  const methodNodes = extractMethods(sourceFile);
  const methodSpecs = methodNodes.map(m => buildPathSpec(m, sourceFile));
  const spec = buildSpec(methodSpecs);

  // Attach per-exchange SDK constructor metadata from app.ts
  const appTsContent = fs.readFileSync(APP_TS_PATH, 'utf-8');
  const exchanges = parseExchanges(appTsContent);
  spec['x-sdk-constructors'] = buildSdkConstructors(exchanges);

  const yamlStr = yaml.dump(spec, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  fs.writeFileSync(OPENAPI_OUT_PATH, yamlStr, 'utf-8');
  console.log(`Generated ${path.relative(process.cwd(), OPENAPI_OUT_PATH)}`);

  const methodVerbs = buildMethodVerbs(methodSpecs);
  fs.writeFileSync(
    METHOD_VERBS_OUT_PATH,
    JSON.stringify(methodVerbs, null, 2) + '\n',
    'utf-8'
  );
  console.log(
    `Generated ${path.relative(process.cwd(), METHOD_VERBS_OUT_PATH)}`
  );

  const getCount = methodSpecs.filter(s => s.verb === 'get').length;
  const postCount = methodSpecs.length - getCount;
  console.log(
    `  ${methodSpecs.length} endpoints extracted from BaseExchange.ts ` +
      `(${getCount} GET, ${postCount} POST):`
  );
  for (const { name, verb } of methodSpecs) {
    console.log(`  - ${verb.toUpperCase().padEnd(4)} ${name}`);
  }
}

main();
