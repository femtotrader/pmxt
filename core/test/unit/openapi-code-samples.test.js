const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const coreRoot = path.join(repoRoot, 'core');
const openApiPath = path.join(repoRoot, 'docs/api-reference/openapi.json');
const sidecarOpenApiPath = path.join(coreRoot, 'src/server/openapi.yaml');
const methodVerbsPath = path.join(coreRoot, 'src/server/method-verbs.json');
const typescriptIndexPath = path.join(repoRoot, 'sdks/typescript/index.ts');
const pythonInitPath = path.join(repoRoot, 'sdks/python/pmxt/__init__.py');
const generatedPaths = [openApiPath, sidecarOpenApiPath, methodVerbsPath];

function snapshotGeneratedFiles() {
  return new Map(
    generatedPaths.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]),
  );
}

function restoreGeneratedFiles(snapshot) {
  for (const [filePath, contents] of snapshot) {
    fs.writeFileSync(filePath, contents, 'utf8');
  }
}

function collectSampleClassNames(spec, language) {
  return [
    ...new Set(
      Object.values(spec.paths || {})
        .flatMap((pathItem) => Object.values(pathItem))
        .filter((operation) => operation && typeof operation === 'object')
        .flatMap((operation) => operation['x-codeSamples'] || [])
        .filter((sample) => sample.lang === language)
        .map((sample) => sample.label),
    ),
  ].sort();
}

function collectTypescriptExports(source) {
  return new Set(
    [...source.matchAll(/^export \{([^}]+)\} from ".+";/gm)]
      .flatMap((match) => match[1].split(','))
      .map((rawName) => rawName.trim().split(/\s+as\s+/).pop())
      .filter(Boolean),
  );
}

function collectPythonAll(source) {
  const allBlock = source.match(/__all__ = \[([\s\S]*?)\]/);
  if (!allBlock) return new Set();
  return new Set([...allBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

function getOperation(spec, operationId) {
  for (const pathItem of Object.values(spec.paths || {})) {
    for (const operation of Object.values(pathItem || {})) {
      if (operation && operation.operationId === operationId) {
        return operation;
      }
    }
  }
  throw new Error(`Operation not found: ${operationId}`);
}

function collectOperationSamples(spec, operationId, language) {
  return (getOperation(spec, operationId)['x-codeSamples'] || [])
    .filter((sample) => sample.lang === language)
    .map((sample) => sample.source);
}

function withGeneratedSpec(assertion) {
  const snapshot = snapshotGeneratedFiles();
  try {
    execFileSync(process.execPath, ['scripts/generate-openapi.js'], {
      cwd: coreRoot,
      stdio: 'pipe',
    });

    const spec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
    return assertion(spec);
  } finally {
    restoreGeneratedFiles(snapshot);
  }
}

describe('OpenAPI SDK code samples', () => {
  test('use SDK class names exported by TypeScript and Python packages', () => {
    withGeneratedSpec((spec) => {
      const typescriptExports = collectTypescriptExports(
        fs.readFileSync(typescriptIndexPath, 'utf8'),
      );
      const pythonExports = collectPythonAll(fs.readFileSync(pythonInitPath, 'utf8'));
      const typescriptSampleNames = collectSampleClassNames(spec, 'javascript');
      const pythonSampleNames = collectSampleClassNames(spec, 'python');

      expect(typescriptSampleNames).toContain('PolymarketUS');
      expect(typescriptSampleNames).toContain('SuiBets');
      expect(typescriptSampleNames).not.toContain('PolymarketUs');
      expect(typescriptSampleNames).not.toContain('Suibets');
      expect(pythonSampleNames).toContain('PolymarketUS');
      expect(pythonSampleNames).toContain('SuiBets');
      expect(pythonSampleNames).not.toContain('PolymarketUs');
      expect(pythonSampleNames).not.toContain('Suibets');

      const missingTypescript = typescriptSampleNames
        .filter((name) => !typescriptExports.has(name));
      const missingPython = pythonSampleNames
        .filter((name) => !pythonExports.has(name));

      expect(missingTypescript).toEqual([]);
      expect(missingPython).toEqual([]);
    });
  });

  test('use positional SDK calls for order-book samples', () => {
    withGeneratedSpec((spec) => {
      const fetchBookTypeScript = collectOperationSamples(spec, 'fetchOrderBook', 'javascript');
      const fetchBooksTypeScript = collectOperationSamples(spec, 'fetchOrderBooks', 'javascript');
      const fetchBookPython = collectOperationSamples(spec, 'fetchOrderBook', 'python');
      const fetchBooksPython = collectOperationSamples(spec, 'fetchOrderBooks', 'python');

      expect(fetchBookTypeScript.length).toBeGreaterThan(0);
      expect(fetchBooksTypeScript.length).toBeGreaterThan(0);
      expect(fetchBookPython.length).toBeGreaterThan(0);
      expect(fetchBooksPython.length).toBeGreaterThan(0);

      for (const sample of fetchBookTypeScript) {
        expect(sample).toContain('const result = await exchange.fetchOrderBook(');
        expect(sample).toContain('"67890"');
        expect(sample).not.toContain('exchange.fetchOrderBook({');
      }

      for (const sample of fetchBooksTypeScript) {
        expect(sample).toContain('const result = await exchange.fetchOrderBooks(["67890"]);');
        expect(sample).not.toContain('exchange.fetchOrderBooks();');
      }

      for (const sample of fetchBookPython) {
        expect(sample).toContain('result = exchange.fetch_order_book(');
        expect(sample).toContain('"67890"');
        expect(sample).not.toContain('outcome_id=');
      }

      for (const sample of fetchBooksPython) {
        expect(sample).toContain('result = exchange.fetch_order_books(["67890"])');
        expect(sample).not.toContain('exchange.fetch_order_books()');
      }
    });
  });

  test('include outcome ids in submit-order build samples', () => {
    withGeneratedSpec((spec) => {
      const submitTypeScript = collectOperationSamples(spec, 'submitOrder', 'javascript');
      const submitPython = collectOperationSamples(spec, 'submitOrder', 'python');

      expect(submitTypeScript.length).toBeGreaterThan(0);
      expect(submitPython.length).toBeGreaterThan(0);

      for (const sample of submitTypeScript) {
        expect(sample).toContain(
          'const built = await exchange.buildOrder({ marketId: "12345", outcomeId: "67890"',
        );
      }

      for (const sample of submitPython) {
        expect(sample).toContain(
          'built = exchange.build_order(market_id="12345", outcome_id="67890"',
        );
      }
    });
  });
});
