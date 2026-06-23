const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

function readDoc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function getFencedBlocks(markdown, language) {
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;

  return Array.from(markdown.matchAll(fencePattern))
    .filter((match) => match[1].trim().split(/\s+/)[0].toLowerCase() === language)
    .map((match) => match[2]);
}

function findBlock(markdown, language, marker) {
  const block = getFencedBlocks(markdown, language).find((candidate) =>
    candidate.includes(marker),
  );

  if (!block) {
    throw new Error(`Could not find ${language} snippet containing ${marker}`);
  }

  return block;
}

describe('Documentation copy-paste samples', () => {
  test('standalone TypeScript pmxt namespace examples import the namespace they use', () => {
    const migrationGuide = readDoc('docs/MIGRATE_FROM_DOMEAPI.md');
    const authenticationGuide = readDoc('docs/authentication.mdx');
    const snippets = [
      findBlock(migrationGuide, 'typescript', 'privateKey: process.env.POLYMARKET_PRIVATE_KEY'),
      findBlock(migrationGuide, 'typescript', 'const limitless = new pmxt.Limitless();'),
      findBlock(authenticationGuide, 'typescript', 'pmxtApiKey: "pmxt_live_..."'),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import pmxt from');
      expect(snippet).toMatch(/\bnew pmxt\./);
    }
  });

  test('standalone Python pmxt namespace examples import the package they use', () => {
    const migrationGuide = readDoc('docs/MIGRATE_FROM_DOMEAPI.md');
    const authenticationGuide = readDoc('docs/authentication.mdx');
    const snippets = [
      findBlock(migrationGuide, 'python', "private_key=os.getenv('POLYMARKET_PRIVATE_KEY')"),
      findBlock(authenticationGuide, 'python', 'poly = pmxt.Polymarket(pmxt_api_key'),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import pmxt');
      expect(snippet).toContain('pmxt.Polymarket');
    }
  });

  test('standalone Python setup examples import pmxt before using the namespace', () => {
    const introduction = readDoc('docs/introduction.mdx');
    const configuration = readDoc('docs/api-reference/configuration.mdx');
    const selfHosted = readDoc('docs/guides/self-hosted.mdx');
    const signing = readDoc('docs/guides/signing.mdx');
    const readme = readDoc('readme.md');
    const pythonReadme = readDoc('sdks/python/README.md');
    const snippets = [
      findBlock(introduction, 'python', '# Self-hosted: SDK spawns pmxt-core on localhost'),
      findBlock(introduction, 'python', 'router = pmxt.Router'),
      findBlock(configuration, 'python', 'PMXT_BASE_URL'),
      findBlock(configuration, 'python', '# Minimum hosted trading config:'),
      findBlock(configuration, 'python', '# Self-hosted: no PMXT_API_KEY'),
      findBlock(selfHosted, 'python', 'pmxt.server.start()'),
      findBlock(selfHosted, 'python', 'pmxt.Limitless(private_key'),
      findBlock(selfHosted, 'python', 'pmxt.Smarkets(email='),
      findBlock(selfHosted, 'python', 'pmxt.Baozi(private_key='),
      findBlock(selfHosted, 'python', 'kalshi = pmxt.Kalshi(api_key_id='),
      findBlock(signing, 'python', 'read_only = pmxt.Polymarket'),
      findBlock(signing, 'python', 'signer=my_custom_signer'),
      findBlock(readme, 'python', "private_key=os.getenv('POLYMARKET_PRIVATE_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('KALSHI_API_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('LIMITLESS_API_KEY')"),
      findBlock(pythonReadme, 'python', 'auto_start_server=False'),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import pmxt');
    }
  });

  test('standalone TypeScript direct-class examples import the class they instantiate', () => {
    const signing = readDoc('docs/guides/signing.mdx');
    const snippet = findBlock(signing, 'typescript', 'signer: myCustomSigner');

    expect(snippet).toContain('import { Polymarket } from "pmxtjs";');
    expect(snippet).toContain('new Polymarket');
  });

  test('standalone Python README self-hosted examples import os before getenv use', () => {
    const readme = readDoc('readme.md');
    const snippets = [
      findBlock(readme, 'python', "private_key=os.getenv('POLYMARKET_PRIVATE_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('KALSHI_API_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('LIMITLESS_API_KEY')"),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import os');
      expect(snippet).toContain('os.getenv');
    }
  });

  test('root README TypeScript import guidance matches exported named classes', () => {
    const readme = readDoc('readme.md');

    expect(readme).toContain('import { Polymarket } from "pmxtjs";');
    expect(readme).not.toContain('Named imports do not work in ESM');
  });

  test('hosted TypeScript trading snippets do not require unsafe any casts', () => {
    const rootReadme = readDoc('readme.md');
    const typescriptReadme = readDoc('sdks/typescript/README.md');

    expect(rootReadme).toContain('slippage_pct: 30.0');
    expect(typescriptReadme).toContain('slippage_pct: 30.0');
    expect(rootReadme).not.toContain('} as any);');
    expect(typescriptReadme).not.toContain('} as any);');
  });

  test('hosted limit-order docs do not carry stale SDK denom mismatch caveats', () => {
    const tradingQuickstart = readDoc('docs/trading-quickstart.mdx');
    const hostedErrors = readDoc('docs/guides/hosted-errors.mdx');
    const hostedDocs = `${tradingQuickstart}\n${hostedErrors}`;

    expect(hostedDocs).not.toMatch(/limit BUY is (currently )?being patched for an SDK denom mismatch/);
    expect(hostedDocs).not.toContain('post limits via self-hosted');
    expect(tradingQuickstart).toContain('limit BUY and SELL are supported');
    expect(hostedErrors).toMatch(/Limit BUY and SELL are supported/);
  });
});
