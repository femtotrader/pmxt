#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..', 'docs');
const OPENAPI_HOSTED_PATH = path.join(DOCS_DIR, 'api-reference', 'openapi-hosted.json');
const OPENAPI_CORE_PATH = path.join(DOCS_DIR, 'api-reference', 'openapi.json');
const DOCS_JSON_PATH = path.join(DOCS_DIR, 'docs.json');
const RATE_LIMITS_PATH = path.join(DOCS_DIR, 'rate-limits.mdx');
const VENUES_PATH = path.join(DOCS_DIR, 'concepts', 'venues.mdx');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Replace content between marker comments, or append markers + content if
 * they don't exist yet.  Returns the updated text.
 */
function replaceBetweenMarkers(text, markerName, replacement, fallbackInsertBefore) {
  const startTag = `{/* HOSTED-AUTOGEN:${markerName}:START */}`;
  const endTag = `{/* HOSTED-AUTOGEN:${markerName}:END */}`;

  const startIdx = text.indexOf(startTag);
  const endIdx = text.indexOf(endTag);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = text.slice(0, startIdx + startTag.length);
    const after = text.slice(endIdx);
    return `${before}\n${replacement}\n${after}`;
  }

  // Markers don't exist — insert them
  const block = `\n${startTag}\n${replacement}\n${endTag}\n`;

  if (fallbackInsertBefore) {
    const insertIdx = text.indexOf(fallbackInsertBefore);
    if (insertIdx !== -1) {
      return text.slice(0, insertIdx) + block + '\n' + text.slice(insertIdx);
    }
  }

  // Last resort: append
  return text + block;
}

// ---------------------------------------------------------------------------
// 1. Write standalone hosted OpenAPI spec
// ---------------------------------------------------------------------------

// Mintlify requires operationId to resolve "METHOD /path" references in
// docs.json. Auto-generate one for any operation that lacks it.
// e.g. POST /v0/sql -> "postV0Sql", GET /v0/events/{id} -> "getV0EventsId"
function ensureOperationIds(paths) {
  const result = {};
  for (const [pathKey, methods] of Object.entries(paths)) {
    const updatedMethods = {};
    for (const [method, op] of Object.entries(methods)) {
      if (op.operationId) {
        updatedMethods[method] = op;
      } else {
        const slug = pathKey
          .replace(/^\//, '')
          .replace(/\{(\w+)\}/g, (_, p) => p.charAt(0).toUpperCase() + p.slice(1))
          .split('/')
          .map((seg, i) => i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1))
          .join('');
        const operationId = method.toLowerCase() + slug.charAt(0).toUpperCase() + slug.slice(1);
        updatedMethods[method] = { ...op, operationId };
      }
    }
    result[pathKey] = updatedMethods;
  }
  return result;
}

function writeHostedOpenApiSpec(openApiPaths, openApiComponents, hostedVersion) {
  if (!openApiPaths || Object.keys(openApiPaths).length === 0) {
    console.log('  [openapi-hosted] No paths in manifest — skipping.');
    return;
  }

  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'PMXT Hosted Router API',
      description: 'Hosted-only endpoints for cross-venue search, matching, arbitrage, and SQL.',
      version: hostedVersion || '0.0.0',
    },
    servers: [
      { url: 'https://api.pmxt.dev', description: 'Production' },
    ],
    security: [{ apiKey: [] }],
    paths: ensureOperationIds(openApiPaths),
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
      ...(openApiComponents && Object.keys(openApiComponents).length > 0
        ? { schemas: openApiComponents.schemas || {} }
        : {}),
    },
  };

  // Resolve path-based $refs (e.g. "#/paths/~1v0~1sql/post/responses/200")
  // into inline content. Most OpenAPI renderers (including Mintlify) only
  // support $refs to #/components/*.
  resolvePathRefs(spec);

  fs.mkdirSync(path.dirname(OPENAPI_HOSTED_PATH), { recursive: true });
  writeJson(OPENAPI_HOSTED_PATH, spec);

  const pathKeys = Object.keys(openApiPaths);
  console.log(`  [openapi-hosted] Wrote ${pathKeys.length} path(s): ${pathKeys.join(', ')}`);
}

// Walk the spec and replace any $ref pointing at #/paths/... with the
// referenced object inlined.
function resolvePathRefs(spec) {
  function resolve(ref) {
    // "#/paths/~1v0~1sql/post/responses/200" -> ["paths","/v0/sql","post","responses","200"]
    const parts = ref
      .replace(/^#\//, '')
      .split('/')
      .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = spec;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  function walk(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(walk);

    if (obj.$ref && typeof obj.$ref === 'string' && obj.$ref.startsWith('#/paths/')) {
      const resolved = resolve(obj.$ref);
      if (resolved) return walk(JSON.parse(JSON.stringify(resolved)));
      // If unresolvable, leave the $ref as-is.
      return obj;
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = walk(value);
    }
    return result;
  }

  // Mutate spec.paths in place with resolved references.
  spec.paths = walk(spec.paths);
}

// ---------------------------------------------------------------------------
// 2. Update docs.json navigation
// ---------------------------------------------------------------------------

// Collect all operationIds from the core spec so we can skip hosted
// endpoints that already have a core equivalent in the docs.
function getCoreOperationIds() {
  if (!fs.existsSync(OPENAPI_CORE_PATH)) return new Set();
  const spec = readJson(OPENAPI_CORE_PATH);
  const ids = new Set();
  for (const methods of Object.values(spec.paths || {})) {
    for (const op of Object.values(methods)) {
      if (op.operationId) ids.add(op.operationId.toLowerCase());
    }
  }
  return ids;
}

// Derive a canonical name from a hosted path for matching against core
// operationIds.  e.g. /v0/markets/{id}/matches -> "marketmatches",
// /v0/sql -> "sql".
function deriveCanonicalName(pathKey) {
  return pathKey
    .replace(/^\/v0\//, '')
    .replace(/\{[^}]+\}\/?/g, '')
    .replace(/\/$/, '')
    .split('/')
    .map((seg, i) => i > 0 ? seg : seg.replace(/s$/, ''))
    .join('');
}

function buildNavPages(openApiPaths) {
  const coreOps = getCoreOperationIds();
  const pages = [];
  const skipped = [];

  for (const [pathKey, methods] of Object.entries(openApiPaths)) {
    const canonical = deriveCanonicalName(pathKey);
    const hasCoreEquivalent = [...coreOps].some(
      (opId) => opId.includes(canonical) && canonical.length > 0
    );

    for (const method of Object.keys(methods)) {
      const ref = `${method.toUpperCase()} ${pathKey}`;
      if (hasCoreEquivalent) {
        skipped.push(ref);
      } else {
        pages.push(ref);
      }
    }
  }

  if (skipped.length > 0) {
    console.log(`  [docs.json] Skipped ${skipped.length} page(s) with core equivalents: ${skipped.join(', ')}`);
  }
  return pages;
}

function updateDocsNavigation(openApiPaths) {
  if (!openApiPaths || Object.keys(openApiPaths).length === 0) {
    console.log('  [docs.json] No paths — skipping.');
    return;
  }

  if (!fs.existsSync(DOCS_JSON_PATH)) {
    console.warn(`  [docs.json] WARN: ${DOCS_JSON_PATH} does not exist — skipping.`);
    return;
  }

  const docsJson = readJson(DOCS_JSON_PATH);
  const navPages = buildNavPages(openApiPaths);

  const apiRefTab = docsJson.navigation.tabs.find(
    (t) => t.tab === 'API Reference'
  );

  if (!apiRefTab) {
    console.warn('  [docs.json] WARN: No "API Reference" tab found — skipping.');
    return;
  }

  const routerGroup = apiRefTab.groups.find((g) => g.group === 'Router');

  const newGroup = {
    group: 'Router',
    openapi: 'api-reference/openapi-hosted.json',
    pages: navPages,
  };

  const updatedGroups = routerGroup
    ? apiRefTab.groups.map((g) => (g.group === 'Router' ? newGroup : g))
    : [...apiRefTab.groups, newGroup];

  const updatedApiRefTab = { ...apiRefTab, groups: updatedGroups };
  const updatedTabs = docsJson.navigation.tabs.map((t) =>
    t.tab === 'API Reference' ? updatedApiRefTab : t
  );
  const updatedNavigation = { ...docsJson.navigation, tabs: updatedTabs };
  const updatedDocsJson = { ...docsJson, navigation: updatedNavigation };

  writeJson(DOCS_JSON_PATH, updatedDocsJson);
  console.log(`  [docs.json] Router group updated with ${navPages.length} page(s).`);
}

// ---------------------------------------------------------------------------
// 3. Update rate-limits.mdx
// ---------------------------------------------------------------------------

function buildRateLimitsTable(rateLimits) {
  if (!rateLimits || rateLimits.length === 0) {
    return '| Endpoint | Per-minute | Per-month |\n| -------- | ---------- | --------- |\n| (none)   | —          | —         |';
  }

  const header = '| Endpoint | Per-minute | Per-month |\n| -------- | ---------- | --------- |';
  const rows = rateLimits.map(
    (r) => `| \`${r.endpoint}\` | ${r.perMinute} | ${formatNumber(r.perMonth)} |`
  );
  return [header, ...rows].join('\n');
}

function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

function updateRateLimits(rateLimits) {
  if (!rateLimits) {
    console.log('  [rate-limits] No rateLimits in manifest — skipping.');
    return;
  }

  if (!fs.existsSync(RATE_LIMITS_PATH)) {
    console.warn(`  [rate-limits] WARN: ${RATE_LIMITS_PATH} does not exist — skipping.`);
    return;
  }

  const text = readText(RATE_LIMITS_PATH);
  const table = buildRateLimitsTable(rateLimits);
  const updated = replaceBetweenMarkers(
    text,
    'rate-limits-table',
    table,
    '## Rate limit responses'
  );
  writeText(RATE_LIMITS_PATH, updated);
  console.log(`  [rate-limits] Table updated with ${rateLimits.length} row(s).`);
}

// ---------------------------------------------------------------------------
// 4. Update venues.mdx with catalog venues
// ---------------------------------------------------------------------------

function buildCatalogVenuesSection(catalogVenues) {
  if (!catalogVenues || catalogVenues.length === 0) {
    return '_No catalog venues configured._';
  }

  const header = '| Venue | Wire Key | Ingestion |\n| ----- | -------- | --------- |';
  const rows = catalogVenues.map(
    (v) => `| ${v.name} | \`${v.wireKey}\` | ${v.ingestion || 'polling'} |`
  );
  return `## Catalog Venues\n\nThe hosted catalog currently ingests the following venues:\n\n${[header, ...rows].join('\n')}`;
}

function updateVenues(catalogVenues) {
  if (!catalogVenues) {
    console.log('  [venues] No catalogVenues in manifest — skipping.');
    return;
  }

  if (!fs.existsSync(VENUES_PATH)) {
    console.warn(`  [venues] WARN: ${VENUES_PATH} does not exist — skipping.`);
    return;
  }

  const text = readText(VENUES_PATH);
  const section = buildCatalogVenuesSection(catalogVenues);
  const updated = replaceBetweenMarkers(
    text,
    'catalog-venues',
    section,
    '## Feature support'
  );
  writeText(VENUES_PATH, updated);
  console.log(`  [venues] Catalog venues updated with ${catalogVenues.length} venue(s).`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadManifest(manifestPath) {
  if (manifestPath && fs.existsSync(manifestPath)) {
    return readJson(manifestPath);
  }

  // Try default
  const defaultPath = path.resolve('.doc-manifest.json');
  if (fs.existsSync(defaultPath)) {
    return readJson(defaultPath);
  }

  return null;
}

function main() {
  const manifestArg = process.argv[2] || null;
  console.log('apply-hosted-manifest: starting…');

  const manifest = loadManifest(manifestArg);

  if (!manifest) {
    console.error(
      'ERROR: No manifest found. Pass a path as first argument or place .doc-manifest.json in cwd.'
    );
    process.exit(1);
  }

  console.log('Manifest loaded. Applying updates…');

  writeHostedOpenApiSpec(manifest.openApiPaths, manifest.openApiComponents, manifest.hostedPmxtVersion);
  updateDocsNavigation(manifest.openApiPaths);
  updateRateLimits(manifest.rateLimits);
  updateVenues(manifest.catalogVenues);

  console.log('apply-hosted-manifest: done.');
}

main();
