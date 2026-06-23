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
    const quickstart = fs.readFileSync(path.join(repoRoot, 'docs/quickstart.mdx'), 'utf8');
    const routerOverview = fs.readFileSync(path.join(repoRoot, 'docs/router/overview.mdx'), 'utf8');
    const routerPrices = fs.readFileSync(path.join(repoRoot, 'docs/router/prices.mdx'), 'utf8');
    const routerSearch = fs.readFileSync(path.join(repoRoot, 'docs/router/search.mdx'), 'utf8');
    const selfHosted = fs.readFileSync(path.join(repoRoot, 'docs/guides/self-hosted.mdx'), 'utf8');
    const tradingQuickstart = fs.readFileSync(path.join(repoRoot, 'docs/trading-quickstart.mdx'), 'utf8');
    const hostedTrading = fs.readFileSync(path.join(repoRoot, 'docs/concepts/hosted-trading.mdx'), 'utf8');
    const hostedWriteDocs = `${selfHosted}\n${tradingQuickstart}\n${hostedTrading}\n${llmsFull}`;
    const fetchOhlcv = fs.readFileSync(path.join(repoRoot, 'docs/api-reference/fetch-ohlcv.mdx'), 'utf8');
    const ohlcvDocs = `${fetchOhlcv}\n${llmsFull}`;
    const routerScopeDocs = `${introduction}\n${quickstart}\n${routerOverview}\n${routerSearch}\n${llmsIndex}\n${llmsFull}`;
    const routerPriceScopeDocs = `${routerOverview}\n${routerPrices}\n${llmsFull}`;
    const topLevelTaglineDocs = `${introduction}\n${llmsIndex}\n${llmsFull}`;
    const introductionVenueScopeDocs = `${introduction}\n${llmsFull}`;
    const quickstartScopeDocs = `${quickstart}\n${llmsFull}`;
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
    expect(routerOverview).toContain('hosted catalog venues');
    expect(llmsIndex).toContain(`Smarkets, and ${additionalVenuePhrase}.`);
    expect(llmsFull).toContain(`Smarkets, and ${additionalVenuePhrase}.`);
    expect(topLevelTaglineDocs).not.toContain('One API for every prediction market');
    expect(topLevelTaglineDocs).toContain('One API for supported prediction markets');
    expect(introductionVenueScopeDocs).not.toContain('Same methods, same response shape, every venue');
    expect(introductionVenueScopeDocs).not.toContain(
      "`create_order`, `fetch_positions` work identically whether you're on",
    );
    expect(introductionVenueScopeDocs).not.toContain(
      'open, resolve, and re-price across every venue',
    );
    expect(introductionVenueScopeDocs).toContain('support varying by venue');
    expect(introductionVenueScopeDocs).toContain('where the venue implements them');
    expect(introductionVenueScopeDocs).toContain('across supported venues');
    expect(`${introduction}\n${routerOverview}\n${llmsIndex}\n${llmsFull}`).not.toContain(
      '8 more venues',
    );
    expect(routerOverview).toContain('Results come from a shared catalog — ~10ms, not one call per venue.');
    expect(llmsFull).toContain('Results come from a shared catalog — ~10ms, not one call per venue.');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain('11 sequential API calls');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain('11 different APIs');
    expect(`${introduction}\n${llmsFull}`).not.toContain('querying 11 APIs sequentially is slow');
    expect(introduction).toContain('querying venue APIs sequentially is slow');
    expect(llmsFull).toContain('querying venue APIs sequentially is slow');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain(
      'ingests markets, events, and outcomes from every venue PMXT supports',
    );
    expect(routerOverview).toContain(
      'ingests markets, events, and outcomes from the hosted catalog venues',
    );
    expect(llmsFull).toContain(
      'ingests markets, events, and outcomes from the hosted catalog venues',
    );
    expect(routerScopeDocs).not.toContain('Search every venue at once');
    expect(routerScopeDocs).not.toContain('unified view of every prediction market');
    expect(routerScopeDocs).not.toContain('One query fans out across every venue');
    expect(routerScopeDocs).not.toContain('Search events and markets across every venue in a single query');
    expect(routerScopeDocs).not.toContain('Search markets and events across every venue in a single query');
    expect(routerScopeDocs).toContain('Search catalog venues at once');
    expect(routerScopeDocs).toContain('across the hosted catalog');
    expect(quickstartScopeDocs).not.toContain('Polymarket, Kalshi, Limitless, or anywhere else');
    expect(quickstartScopeDocs).not.toContain('search everything');
    expect(quickstartScopeDocs).not.toContain(
      'Order books, trades, OHLCV, positions, balances, and trading — all via `POST /api/:exchange/:method`',
    );
    expect(quickstartScopeDocs).toContain('another hosted catalog venue');
    expect(quickstartScopeDocs).toContain('search the hosted catalog');
    expect(quickstartScopeDocs).toContain('supported where each venue implements them');
    expect(quickstart).not.toContain(
      'interface — same methods, same response shape, regardless of which venue',
    );
    expect(quickstart).not.toContain('The methods and response shapes are identical.');
    expect(quickstart).toMatch(/same method names and response shapes where the venue\s+supports them/);
    expect(quickstart).toContain('per-venue capabilities');
    expect(routerPriceScopeDocs).not.toContain('Side-by-side bid/ask for the same market on every venue');
    expect(routerPriceScopeDocs).toContain('identity matches in the hosted catalog');

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
