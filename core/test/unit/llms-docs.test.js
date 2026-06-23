const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const llmsPath = path.join(repoRoot, 'docs/llms.txt');
const llmsFullPath = path.join(repoRoot, 'docs/llms-full.txt');
const supportedVenuesPath = path.join(repoRoot, 'docs/concepts/venues.mdx');
const generatedPaths = [llmsPath, llmsFullPath];

const namedVenueCount = 4;

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

describe('LLMS docs generation', () => {
  test('keeps checked-in LLMS docs synced with user-facing venue docs', () => {
    const snapshot = snapshotGeneratedFiles();
    let generated;
    try {
      execFileSync(process.execPath, ['scripts/generate-llms.js'], {
        cwd: repoRoot,
        stdio: 'pipe',
      });

      generated = new Map(
        generatedPaths.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]),
      );
    } finally {
      restoreGeneratedFiles(snapshot);
    }

    for (const [filePath, contents] of snapshot) {
      expect(generated.get(filePath)).toBe(contents);
    }

    const llmsFull = snapshot.get(llmsFullPath);
    const llmsIndex = snapshot.get(llmsPath);
    const supportedVenues = fs.readFileSync(supportedVenuesPath, 'utf8');
    const introduction = fs.readFileSync(path.join(repoRoot, 'docs/introduction.mdx'), 'utf8');
    const routerOverview = fs.readFileSync(path.join(repoRoot, 'docs/router/overview.mdx'), 'utf8');
    const selfHosted = fs.readFileSync(path.join(repoRoot, 'docs/guides/self-hosted.mdx'), 'utf8');
    const tradingQuickstart = fs.readFileSync(path.join(repoRoot, 'docs/trading-quickstart.mdx'), 'utf8');
    const hostedTrading = fs.readFileSync(path.join(repoRoot, 'docs/concepts/hosted-trading.mdx'), 'utf8');
    const hostedWriteDocs = `${selfHosted}\n${tradingQuickstart}\n${hostedTrading}\n${llmsFull}`;
    const fetchOhlcv = fs.readFileSync(path.join(repoRoot, 'docs/api-reference/fetch-ohlcv.mdx'), 'utf8');
    const ohlcvDocs = `${fetchOhlcv}\n${llmsFull}`;
    const venueRows = Array.from(
      supportedVenues.matchAll(/^\| [^|]+ \| `[^`]+` \| `POST \/api\/[^`]+\/:method` \|$/gm),
    );
    const additionalVenueCount = venueRows.length - namedVenueCount;
    const additionalVenuePhrase = `${additionalVenueCount} more venues`;
    const expectedRows = [
      '| Gemini Titan | `gemini-titan` |',
      '| Hyperliquid | `hyperliquid` |',
      '| SuiBets | `suibets` |',
      '| Rain | `rain` |',
      '| Hunch | `hunch` |',
    ];

    for (const row of expectedRows) {
      expect(llmsFull).toContain(row);
    }

    expect(llmsFull).toContain('PMXT currently supports the following venue targets.');
    expect(llmsFull).not.toContain('| gemini-titan | `gemini-titan` |');
    expect(llmsFull).not.toContain('| hyperliquid | `hyperliquid` |');
    expect(llmsFull).not.toContain('| rain | `rain` |');
    expect(llmsFull).not.toContain('| hunch | `hunch` |');
    expect(llmsFull).not.toContain('| mock | `mock` |');
    expect(llmsFull).not.toContain('| Router | `router` |');

    expect(llmsIndex).toContain('https://pmxt.dev/docs/api-reference/createOrderHosted');
    expect(llmsIndex).toContain('https://pmxt.dev/docs/api-reference/fetchBalanceHosted');
    expect(llmsFull).toContain('`POST /v0/trade/create-order`');
    expect(llmsFull).toContain('`POST /v0/trade/build-order`');
    expect(llmsFull).toContain('`POST /v0/trade/submit-order`');
    expect(llmsFull).toContain('`POST /v0/orders/cancel/build`');
    expect(llmsFull).toContain('`GET /v0/orders/{order_id}`');
    expect(llmsFull).toContain('`GET /v0/user/{address}/balances`');

    expect(venueRows.length).toBeGreaterThan(namedVenueCount);
    expect(introduction).toContain(`Smarkets, and [${additionalVenuePhrase}](/concepts/venues).`);
    expect(routerOverview).toContain(`Smarkets, and [${additionalVenuePhrase}](/concepts/venues)`);
    expect(llmsIndex).toContain(`Smarkets, and ${additionalVenuePhrase}.`);
    expect(llmsFull).toContain(`Smarkets, and ${additionalVenuePhrase}.`);
    expect(`${introduction}\n${routerOverview}\n${llmsIndex}\n${llmsFull}`).not.toContain(
      '8 more venues',
    );
    expect(routerOverview).toContain('Results come from a shared catalog — ~10ms, not one call per venue.');
    expect(llmsFull).toContain('Results come from a shared catalog — ~10ms, not one call per venue.');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain('11 sequential API calls');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain('11 different APIs');

    expect(hostedWriteDocs).not.toContain('Self-hosted writes work on every venue PMXT supports');
    expect(hostedWriteDocs).not.toContain('| **Trading venues** | Polymarket, Opinion, Limitless | Every venue PMXT supports |');
    expect(hostedWriteDocs).toContain('where the venue exposes writes');
    expect(hostedWriteDocs).toContain('Feature Support & Compliance');

    expect(ohlcvDocs).not.toContain('Kalshi, Limitless, and more are coming soon');
    expect(ohlcvDocs).not.toContain('Without an API key, OHLCV is limited to Polymarket');
    expect(fetchOhlcv).toContain('venues whose implementation supports `fetchOHLCV`');
    expect(fetchOhlcv).toContain('Feature Support & Compliance');
    expect(llmsFull).toContain('venues whose implementation supports `fetchOHLCV`');
  });
});
