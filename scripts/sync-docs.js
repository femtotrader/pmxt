#!/usr/bin/env node
//
// sync-docs.js
//
// Copies the OpenAPI spec that ships inside the installed pmxt-core
// package into docs/api-reference/openapi.yaml, then rewrites a handful
// of hosted-specific fields (servers, title, bearer security) so the
// Mintlify build surfaces the correct hosted URL and auth model.
//
// Source of truth is node_modules/pmxt-core/dist/server/openapi.yaml —
// pmxt-core auto-generates that file from BaseExchange.ts on every build
// (see core/scripts/generate-openapi.js in the pmxt repo). We never edit
// it in-place here. This script is idempotent and safe to run on every
// install.
//
// This script runs automatically from the package.json "postinstall"
// hook so that:
//   - local `npm install` keeps docs in lockstep with whatever pmxt-core
//     version is pinned
//   - the automated bump-pmxt-core PR carries a refreshed openapi.yaml
//     in the same commit, so merging the PR ships new docs too
//
// Keep the logic here dumb and self-contained. If pmxt-core's spec is
// missing (e.g. during a weird npm state), this script logs a warning
// and exits 0 — a missing docs build should never break `npm install`.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(
    ROOT,
    'core',
    'dist',
    'server',
    'openapi.yaml'
);
// We emit JSON rather than YAML: Mintlify's OpenAPI validator has
// historically tripped on YAML scalars that look numeric (e.g.
// `openapi: 3.0.0`, `version: 2.26.2`). JSON is unambiguous and removes
// an entire category of "version must be a string" errors.
const DEST = path.join(ROOT, 'docs', 'api-reference', 'openapi.json');
const VENUES_DEST = path.join(ROOT, 'docs', 'concepts', 'venues.mdx');
const DOCS_JSON = path.join(ROOT, 'docs', 'docs.json');
// Legacy filename — if present from an older sync, we delete it so the
// Mintlify CLI doesn't get confused about which config is canonical.
const LEGACY_MINT_JSON = path.join(ROOT, 'docs', 'mint.json');

// The hosted base URL that customers hit. Overridable via env so a
// staging docs build can point at a staging endpoint without a code
// change. Defaults to the production URL.
const HOSTED_URL = process.env.HOSTED_PMXT_URL || 'https://api.pmxt.dev';

// Hoist into a constant so it's visible at the top of the diff when we
// change branding.
const TITLE = 'PMXT Hosted API';
const DESCRIPTION =
    'One API for every prediction market. Cross-venue search in under 10ms, a single unified schema, and the complete venue surface from reads to trades.';

function readPinnedCoreVersion() {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(
                path.join(ROOT, 'core', 'package.json'),
                'utf8'
            )
        );
        return pkg.version;
    } catch {
        return 'unknown';
    }
}

function rewriteForHosted(spec, coreVersion) {
    // Shallow-clone so we never mutate the source object. The cost is
    // trivial and it keeps the "immutability" rule honest.
    const next = { ...spec };

    // Coerce version-ish fields to strings explicitly. YAML round-trips
    // them fine, but the OpenAPI validator is very particular about
    // `openapi` and `info.version` being strings, so we belt-and-braces
    // it here.
    next.openapi = String(spec.openapi || '3.0.0');

    next.info = {
        ...(spec.info || {}),
        title: TITLE,
        description: DESCRIPTION,
        // Track the pmxt-core version this spec was generated from, so
        // Mintlify's rendered footer tells readers exactly which upstream
        // release they're looking at.
        version: String(coreVersion),
    };

    next.servers = [
        {
            url: HOSTED_URL,
            description: 'Hosted PMXT (production)',
        },
    ];

    // Add bearer auth scheme globally — the sidecar spec has no auth
    // because the local sidecar is unauthenticated, but the hosted
    // surface requires an API key on every request.
    const components = { ...(spec.components || {}) };
    components.securitySchemes = {
        ...(components.securitySchemes || {}),
        bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description:
                'Required when calling the hosted API directly (curl, requests, fetch). SDK users pass credentials via constructor params instead.',
        },
    };
    next.components = components;

    next.security = [{ bearerAuth: [] }];

    return next;
}

// ---------------------------------------------------------------------------
// SDK code sample generation (x-codeSamples).
//
// Mintlify supports `x-codeSamples` on each OpenAPI operation to display
// custom language tabs. We generate Python SDK (pmxt) and TypeScript SDK
// (pmxtjs) samples so users see real SDK calls instead of raw HTTP.
// ---------------------------------------------------------------------------

/** Convert a camelCase string to snake_case, keeping acronyms intact. */
function toSnakeCase(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}

/** Resolve a JSON Pointer $ref (e.g. "#/components/schemas/Foo") against the spec. */
function resolveRef(ref, spec) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
    const parts = ref.replace(/^#\//, '').split('/');
    let current = spec;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

/** Return a sensible example value for a parameter based on its name and schema. */
function exampleValue(name, schema) {
    const lowerName = (name || '').toLowerCase();

    // Name-based heuristics
    if (lowerName === 'query') return 'election';
    if (lowerName === 'id' || lowerName === 'marketid' || lowerName === 'eventid') return '12345';
    if (lowerName === 'outcomeid') return '67890';
    if (lowerName === 'orderid') return 'ord-001';
    if (lowerName === 'limit') return 10;
    if (lowerName === 'offset') return 0;
    if (lowerName === 'cursor') return 'abc123';
    if (lowerName === 'side') return 'buy';
    if (lowerName === 'type') return 'limit';
    if (lowerName === 'amount') return 10;
    if (lowerName === 'price') return 0.55;
    if (lowerName === 'symbol' || lowerName === 'slug') return 'BTC-USD';
    if (lowerName === 'address') return '0xabc...';
    if (lowerName === 'resolution') return '1h';
    if (lowerName.includes('id')) return '12345';

    // Schema-based fallbacks
    if (schema) {
        if (schema.example !== undefined) return schema.example;
        if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
        if (schema.type === 'string') return 'value';
        if (schema.type === 'number' || schema.type === 'integer') return 1;
        if (schema.type === 'boolean') return true;
        if (schema.type === 'array') return [];
        if (schema.type === 'object') return {};
    }

    return 'value';
}

/** Format a value for Python source code. */
function formatPyValue(v) {
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (Array.isArray(v)) return '[]';
    if (v !== null && typeof v === 'object') return '{}';
    return String(v);
}

/** Format a value for JavaScript/TypeScript source code. */
function formatJsValue(v) {
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return '[]';
    if (v !== null && typeof v === 'object') return '{}';
    return String(v);
}

// Params that are more useful in examples — we prefer these when picking
// optional params to show.

/**
 * For GET endpoints, collect query parameters (skipping ExchangeParam $refs).
 * Returns an array of { name, value } objects — required params first, then
 * up to 2 preferred optional ones.
 */
function extractGetParams(operation, spec) {
    const params = operation.parameters || [];
    const required = [];
    const optional = [];

    for (const raw of params) {
        const param = raw.$ref ? resolveRef(raw.$ref, spec) : raw;
        if (!param) continue;

        // Skip the path-level exchange parameter — it's part of the URL, not
        // a kwarg the SDK user passes.
        if (param.name === 'exchange' || (param.schema && param.schema.title === 'ExchangeParam')) {
            continue;
        }
        if (param.in !== 'query') continue;

        const entry = { name: param.name, value: exampleValue(param.name, param.schema || {}) };
        if (param.required) {
            required.push(entry);
        } else {
            optional.push(entry);
        }
    }

    return [...required, ...optional];
}

/**
 * For POST endpoints, resolve the requestBody schema's `args.items` and
 * extract required properties plus 1-2 optional, capped at 4 total.
 */
function extractPostParams(operation, spec) {
    const content = operation.requestBody?.content?.['application/json'];
    if (!content) return [];

    let bodySchema = content.schema;
    if (bodySchema?.$ref) bodySchema = resolveRef(bodySchema.$ref, spec);
    if (!bodySchema) return [];

    // Drill into args.items if present (the pmxt spec wraps POST bodies
    // as { exchange, args: [{ ...params }] }).
    let targetSchema = bodySchema;
    const argsSchema = bodySchema.properties?.args;
    if (argsSchema) {
        let itemsSchema = argsSchema.items;
        if (itemsSchema?.$ref) itemsSchema = resolveRef(itemsSchema.$ref, spec);
        if (itemsSchema) targetSchema = itemsSchema;
    }

    const properties = targetSchema.properties || {};
    const requiredNames = new Set(targetSchema.required || []);
    const required = [];
    const optional = [];

    for (const [name, propSchema] of Object.entries(properties)) {
        const resolved = propSchema?.$ref ? resolveRef(propSchema.$ref, spec) : propSchema;
        const entry = { name, value: exampleValue(name, resolved || {}) };
        if (requiredNames.has(name)) {
            required.push(entry);
        } else {
            optional.push(entry);
        }
    }

    return [...required, ...optional];
}

// Endpoints where the OpenAPI schema doesn't provide good named params
// (positional-arg POST endpoints, or GET endpoints with overly broad
// shared param sets). The generator uses these instead of extracting
// from the schema.
const PARAM_OVERRIDES = {
    // Singular lookups — prefer ID params over the broad search params
    fetchMarket: [{ name: 'marketId', value: '12345' }],
    fetchEvent: [{ name: 'eventId', value: '12345' }],
    // Positional-arg POST endpoints whose args schema is [string], not
    // an object with named properties
    cancelOrder: [{ name: 'orderId', value: 'ord-001' }],
    watchOrderBook: [{ name: 'id', value: '12345' }],
    watchTrades: [{ name: 'id', value: '12345' }],
    watchAddress: [{ name: 'address', value: '0xabc...' }],
    unwatchAddress: [{ name: 'address', value: '0xabc...' }],
    getExecutionPrice: [
        { name: 'orderBook', value: 'orderBook' },
        { name: 'side', value: 'buy' },
        { name: 'amount', value: 10 },
    ],
    getExecutionPriceDetailed: [
        { name: 'orderBook', value: 'orderBook' },
        { name: 'side', value: 'buy' },
        { name: 'amount', value: 10 },
    ],
    editOrder: [
        { name: 'orderId', value: 'ord-001' },
        { name: 'price', value: 0.55 },
        { name: 'amount', value: 10 },
    ],
};

// Endpoints where the full example needs a custom template because the
// SDK calling convention differs substantially from keyword args.
// These store only the method-call lines — the per-exchange constructor
// preamble is prepended dynamically by generateCodeSamples().
const FULL_OVERRIDES = {
    submitOrder: {
        pythonBody: [
            'built = exchange.build_order(market_id="12345", side="buy", type="limit", amount=10, price=0.55)',
            'result = exchange.submit_order(built)',
        ],
        typescriptBody: [
            'const built = await exchange.buildOrder({ marketId: "12345", side: "buy", type: "limit", amount: 10, price: 0.55 });',
            'const result = await exchange.submitOrder(built);',
        ],
    },
};

/** Default fallback when x-sdk-constructors is missing from the spec. */
const FALLBACK_CONSTRUCTORS = {
    kalshi: {
        className: 'Kalshi',
        params: [],
    },
};

/** Return the example value for a constructor param. */
function constructorParamValue(param) {
    if (param.default !== undefined) return param.default;
    return `YOUR_${param.name.toUpperCase()}`;
}

/**
 * Build the Python preamble lines (import + constructor) for one exchange.
 * Returns an array of source lines.
 */
function buildPyPreamble(exchangeInfo) {
    const lines = [
        'import pmxt',
        '',
    ];
    if (exchangeInfo.params.length === 0) {
        lines.push(`exchange = pmxt.${exchangeInfo.className}()`);
    } else {
        lines.push(`exchange = pmxt.${exchangeInfo.className}(`);
        for (const param of exchangeInfo.params) {
            lines.push(`    ${param.name}=${formatPyValue(constructorParamValue(param))},`);
        }
        lines.push(')');
    }
    return lines;
}

/**
 * Build the TypeScript preamble lines (import + constructor) for one exchange.
 * Returns an array of source lines.
 */
function buildTsPreamble(exchangeInfo) {
    const lines = [
        `import { ${exchangeInfo.className} } from "pmxtjs";`,
        '',
    ];
    if (exchangeInfo.params.length === 0) {
        lines.push(`const exchange = new ${exchangeInfo.className}();`);
    } else {
        lines.push(`const exchange = new ${exchangeInfo.className}({`);
        for (const param of exchangeInfo.params) {
            lines.push(`  ${param.tsName || param.name}: ${formatJsValue(constructorParamValue(param))},`);
        }
        lines.push('});');
    }
    return lines;
}

/**
 * Build the Python method-call lines for a standard (non-override) endpoint.
 * Returns an array of source lines.
 */
function buildPyMethodCall(pyMethod, params) {
    if (params.length === 0) {
        return [`result = exchange.${pyMethod}()`];
    }
    if (params.length <= 2) {
        const inline = params.map((p) => `${toSnakeCase(p.name)}=${formatPyValue(p.value)}`).join(', ');
        return [`result = exchange.${pyMethod}(${inline})`];
    }
    const lines = [`result = exchange.${pyMethod}(`];
    for (const p of params) {
        lines.push(`    ${toSnakeCase(p.name)}=${formatPyValue(p.value)},`);
    }
    lines.push(')');
    return lines;
}

/**
 * Build the TypeScript method-call lines for a standard (non-override) endpoint.
 * Returns an array of source lines.
 */
function buildTsMethodCall(jsMethod, params) {
    if (params.length === 0) {
        return [`const result = await exchange.${jsMethod}();`];
    }
    if (params.length <= 2) {
        const inline = params.map((p) => `${p.name}: ${formatJsValue(p.value)}`).join(', ');
        return [`const result = await exchange.${jsMethod}({ ${inline} });`];
    }
    const lines = [`const result = await exchange.${jsMethod}({`];
    for (const p of params) {
        lines.push(`  ${p.name}: ${formatJsValue(p.value)},`);
    }
    lines.push('});');
    return lines;
}

/**
 * Generate an x-codeSamples array for a single operation.
 * Returns undefined for healthCheck (no SDK equivalent).
 *
 * Produces one Python + one TypeScript sample per exchange listed in
 * spec['x-sdk-constructors']. Raw HTTP samples (curl, requests, fetch, etc.)
 * are auto-generated by Mintlify and appear alongside these in the language
 * dropdown — no need to build them here.
 */
function generateCodeSamples(operationId, httpMethod, pathKey, operation, spec) {
    if (!operationId || operationId === 'healthCheck') return undefined;

    const constructors = spec['x-sdk-constructors'] || FALLBACK_CONSTRUCTORS;
    const exchangeEntries = Object.entries(constructors);

    const params = PARAM_OVERRIDES[operationId]
        || (httpMethod === 'get'
            ? extractGetParams(operation, spec)
            : extractPostParams(operation, spec));

    // -- SDK samples (per-exchange) ----------------------------------------

    let pythonSdkSamples;
    let tsSdkSamples;

    if (FULL_OVERRIDES[operationId]) {
        const ov = FULL_OVERRIDES[operationId];
        pythonSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'python',
            label: info.className,
            source: [...buildPyPreamble(info), ...ov.pythonBody].join('\n'),
        }));
        tsSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'javascript',
            label: info.className,
            source: [...buildTsPreamble(info), ...ov.typescriptBody].join('\n'),
        }));
    } else {
        const pyMethod = toSnakeCase(operationId);
        const jsMethod = operationId;
        const pyBodyLines = buildPyMethodCall(pyMethod, params);
        const tsBodyLines = buildTsMethodCall(jsMethod, params);

        pythonSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'python',
            label: info.className,
            source: [...buildPyPreamble(info), ...pyBodyLines].join('\n'),
        }));
        tsSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'javascript',
            label: info.className,
            source: [...buildTsPreamble(info), ...tsBodyLines].join('\n'),
        }));
    }

    return [
        ...pythonSdkSamples,
        ...tsSdkSamples,
    ];
}

/**
 * Walk every operation in the spec and attach x-codeSamples.
 * Returns a NEW spec object — the input is never mutated.
 */
function injectCodeSamples(spec) {
    const paths = spec.paths || {};
    const newPaths = {};

    for (const [pathKey, methods] of Object.entries(paths)) {
        const newMethods = {};
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                newMethods[method] = op;
                continue;
            }
            const samples = generateCodeSamples(op.operationId, method, pathKey, op, spec);
            if (samples) {
                newMethods[method] = { ...op, 'x-codeSamples': samples };
            } else {
                newMethods[method] = { ...op };
            }
        }
        newPaths[pathKey] = newMethods;
    }

    return { ...spec, paths: newPaths };
}

// Human-facing venue names, keyed by the wire-format `source_exchange`
// value the SDK sends in the URL. The wire keys are the source of truth
// (read from the openapi spec's ExchangeParam enum); this table only
// supplies the display label. Adding a new venue in pmxt-core shows up
// as an "unknown" row here until it gets a label, but never breaks the
// docs build.
const VENUE_LABELS = {
    polymarket: 'Polymarket',
    polymarket_us: 'Polymarket US',
    kalshi: 'Kalshi',
    'kalshi-demo': 'Kalshi (Demo)',
    limitless: 'Limitless',
    probable: 'Probable',
    baozi: 'Baozi',
    myriad: 'Myriad',
    opinion: 'Opinion',
    metaculus: 'Metaculus',
    smarkets: 'Smarkets',
};

function extractVenues(spec) {
    const enumValues =
        spec?.components?.parameters?.ExchangeParam?.schema?.enum;
    if (!Array.isArray(enumValues)) return [];
    return enumValues.map((wire) => ({
        wire,
        label: VENUE_LABELS[wire] || wire,
    }));
}

function writeVenuesPage(venues, coreVersion) {
    const rows = venues
        .map(
            ({ wire, label }) =>
                `| ${label} | \`${wire}\` | \`POST /api/${wire}/:method\` |`
        )
        .join('\n');

    const body = `---
title: Supported Venues
description: "Every venue PMXT currently speaks."
---

{/*
  AUTO-GENERATED from pmxt-core's openapi spec (ExchangeParam enum).
  Do not edit by hand — run \`npm run docs:sync\` to regenerate.
  Source: node_modules/pmxt-core/dist/server/openapi.yaml
  pmxt-core version at last sync: ${coreVersion}
*/}

PMXT Hosted currently supports the following venues. The **wire key** is
the value you pass in the URL — e.g. \`POST /api/polymarket/fetchMarkets\`
or \`new pmxt.Polymarket({})\` from the SDKs.

| Venue | Wire Key | Pass-Through Base |
| ----- | -------- | ----------------- |
${rows}

<Note>
  This list is regenerated automatically from the \`ExchangeParam\` enum
  in pmxt-core's OpenAPI spec on every \`pmxt-core\` upgrade. If a venue
  is missing here, it's not yet wired through pmxt-core.
</Note>

## Feature support

Not every venue supports every method. Broadly:

- **Catalog reads** (\`fetchMarkets\`, \`fetchEvents\`, \`fetchMarket\`,
  \`fetchEvent\`) — supported on every venue that the catalog ingests.
- **Live reads** (\`fetchOrderBook\`, \`fetchOHLCV\`, \`fetchTrades\`) —
  supported where the venue exposes the data.
- **Writes** (\`createOrder\`, \`cancelOrder\`, \`fetchBalance\`,
  \`fetchPositions\`) — supported where the venue has a trading API.

See the [API Reference](/api-reference/overview) for the per-method
matrix (inferred from the OpenAPI \`operationId\`s).
`;

    fs.mkdirSync(path.dirname(VENUES_DEST), { recursive: true });
    fs.writeFileSync(VENUES_DEST, body);
    console.log(
        `[sync-docs] wrote ${path.relative(ROOT, VENUES_DEST)} ` +
            `(${venues.length} venues)`
    );
}

// ---------------------------------------------------------------------------
// Endpoint grouping for the Mintlify sidebar.
//
// Mintlify renders each OpenAPI operation as a page when it's referenced
// in `navigation` as a string of the form "METHOD /path". We want those
// references bucketed into human-friendly groups rather than a flat list
// of 30 entries.
//
// Rules are checked in order — the first rule that matches an
// operationId wins. Anything unmatched falls into the "Other" group so
// new pmxt-core methods automatically surface (just uncategorised)
// rather than silently disappearing from the sidebar.
// ---------------------------------------------------------------------------

const ENDPOINT_GROUPS = [
    {
        name: 'System',
        match: (opId) => ['healthCheck', 'loadMarkets', 'close'].includes(opId),
    },
    {
        name: 'Markets & Events',
        match: (opId) =>
            /^(fetchMarkets|fetchMarketsPaginated|fetchEvents|fetchMarket|fetchEvent|filterMarkets|filterEvents)$/.test(
                opId
            ),
    },
    {
        name: 'Order Book & Trades',
        match: (opId) =>
            /^(fetchOrderBook|fetchOHLCV|fetchTrades|getExecutionPrice|getExecutionPriceDetailed)$/.test(
                opId
            ),
    },
    {
        name: 'Trading',
        match: (opId) =>
            /^(createOrder|buildOrder|submitOrder|cancelOrder|editOrder)$/.test(
                opId
            ),
    },
    {
        name: 'Orders & Positions',
        match: (opId) =>
            /^(fetchOrder|fetchOpenOrders|fetchClosedOrders|fetchAllOrders|fetchMyTrades|fetchPositions|fetchBalance|fetchOrderHistory)$/.test(
                opId
            ),
    },
    {
        name: 'Realtime',
        match: (opId) => /^(watch|unwatch)/.test(opId),
    },
];

// Build an array of docs.json navigation groups — one per endpoint
// bucket — each pointing at the hosted openapi.json so Mintlify can
// auto-resolve the "METHOD /path" refs into real pages. In the new
// docs.json schema, `openapi` is a legal key on group objects (unlike
// legacy mint.json, where it was only allowed on anchors/tabs).
function buildEndpointGroups(spec) {
    const buckets = new Map();
    for (const group of ENDPOINT_GROUPS) buckets.set(group.name, []);
    buckets.set('Other', []);

    for (const [pathKey, methods] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                continue;
            }
            const opId = op.operationId || '';
            const ref = `${method.toUpperCase()} ${pathKey}`;

            let placed = false;
            for (const group of ENDPOINT_GROUPS) {
                if (group.match(opId)) {
                    buckets.get(group.name).push(ref);
                    placed = true;
                    break;
                }
            }
            if (!placed) buckets.get('Other').push(ref);
        }
    }

    const groups = [];
    for (const [name, refs] of buckets.entries()) {
        if (refs.length === 0) continue;
        groups.push({
            group: name,
            openapi: 'api-reference/openapi.json',
            pages: refs,
        });
    }
    return groups;
}

function updateDocsJsonEndpoints(spec) {
    // Remove any leftover legacy mint.json so the Mintlify CLI doesn't
    // pick up two config files.
    if (fs.existsSync(LEGACY_MINT_JSON)) {
        fs.unlinkSync(LEGACY_MINT_JSON);
        console.log(
            `[sync-docs] removed legacy ${path.relative(ROOT, LEGACY_MINT_JSON)}`
        );
    }

    if (!fs.existsSync(DOCS_JSON)) {
        console.warn(
            `[sync-docs] ${path.relative(ROOT, DOCS_JSON)} not found — skipping docs.json update`
        );
        return;
    }

    const raw = fs.readFileSync(DOCS_JSON, 'utf8');
    const docs = JSON.parse(raw);
    const endpointGroups = buildEndpointGroups(spec);

    // docs.json navigation shape: navigation.tabs[{ tab, groups[] }].
    // Find (or create) the "API Reference" tab and replace its groups
    // with: Overview first, then the auto-generated endpoint buckets
    // (each with its own openapi pointer).
    const nav = docs.navigation || {};
    const tabs = Array.isArray(nav.tabs) ? nav.tabs : [];
    const apiTabIdx = tabs.findIndex((t) => t && t.tab === 'API Reference');
    const apiTab = {
        tab: 'API Reference',
        groups: [
            {
                group: 'Overview',
                pages: ['api-reference/overview'],
            },
            ...endpointGroups,
        ],
    };
    if (apiTabIdx >= 0) {
        tabs[apiTabIdx] = apiTab;
    } else {
        tabs.push(apiTab);
    }
    docs.navigation = { ...nav, tabs };

    fs.writeFileSync(DOCS_JSON, JSON.stringify(docs, null, 2) + '\n');
    const total = endpointGroups.reduce((n, g) => n + g.pages.length, 0);
    console.log(
        `[sync-docs] wrote ${path.relative(ROOT, DOCS_JSON)} ` +
            `(${endpointGroups.length} endpoint groups, ${total} endpoints, under "API Reference" tab)`
    );
}

function main() {
    if (!fs.existsSync(SRC)) {
        console.warn(
            `[sync-docs] ${path.relative(ROOT, SRC)} not found — skipping. ` +
                `Is pmxt-core installed?`
        );
        return;
    }

    const raw = fs.readFileSync(SRC, 'utf8');
    const spec = yaml.load(raw);
    const coreVersion = readPinnedCoreVersion();
    const rewritten = rewriteForHosted(spec, coreVersion);
    const withSamples = injectCodeSamples(rewritten);

    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    const out = JSON.stringify(withSamples, null, 2) + '\n';
    fs.writeFileSync(DEST, out);

    // Remove any stale YAML copy from earlier runs so Mintlify doesn't
    // see two specs under the same directory.
    const staleYaml = path.join(path.dirname(DEST), 'openapi.yaml');
    if (fs.existsSync(staleYaml)) fs.unlinkSync(staleYaml);

    const bytes = Buffer.byteLength(out, 'utf8');
    console.log(
        `[sync-docs] wrote ${path.relative(ROOT, DEST)} ` +
            `(${bytes} bytes, pmxt-core@${coreVersion})`
    );

    // Regenerate the venues page from the same spec — single source of
    // truth, single sync step.
    const venues = extractVenues(spec);
    if (venues.length > 0) {
        writeVenuesPage(venues, coreVersion);
    } else {
        console.warn(
            '[sync-docs] ExchangeParam enum missing from spec — venues page not updated'
        );
    }

    // Re-materialize the "API Reference" tab inside docs.json so the
    // Mintlify sidebar shows every operation, bucketed by purpose.
    updateDocsJsonEndpoints(withSamples);
}

main();
