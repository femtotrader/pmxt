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

  test('hosted TypeScript error examples use typed fields without unsafe any casts', () => {
    const hostedErrors = readDoc('docs/guides/hosted-errors.mdx');
    const errorReference = readDoc('docs/api-reference/errors.mdx');
    const hostedErrorDocs = `${hostedErrors}\n${errorReference}`;

    expect(hostedErrorDocs).not.toContain('(e as any)');
    expect(hostedErrors).toContain('console.log(`Need to deposit. ${e.detail}`);');
    expect(errorReference).toContain('console.log(e.status, e.detail);');
  });

  test('TypeScript order shorthand docs use the public create-order input type', () => {
    const hostedErrors = readDoc('docs/guides/hosted-errors.mdx');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(hostedErrors).toContain('import type { CreateOrderInput, Order } from "pmxtjs";');
    expect(hostedErrors).toContain('params: CreateOrderInput');
    expect(typescriptApiReference).toContain(
      'async createOrder(params: CreateOrderInput): Promise<Order>',
    );
    expect(typescriptApiReference).toContain(
      'async buildOrder(params: CreateOrderInput): Promise<BuiltOrder>',
    );
    expect(typescriptApiReference).toContain('type CreateOrderInput =');
    expect(typescriptApiReference).toContain('outcome: MarketOutcome;');
  });

  test('SDK API reference order examples include runnable parameters', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('await exchange.fetchOrderBooks("12345")');
    expect(typescriptApiReference).not.toContain('await exchange.createOrder()');
    expect(typescriptApiReference).not.toContain('await exchange.buildOrder()');
    expect(typescriptApiReference).not.toContain('await exchange.submitOrder("...")');
    expect(typescriptApiReference).not.toContain(
      'async createOrder(params: CreateOrderParams): Promise<Order>',
    );
    expect(typescriptApiReference).not.toContain(
      'async buildOrder(params: CreateOrderParams): Promise<BuiltOrder>',
    );

    expect(pythonApiReference).not.toContain('exchange.fetch_order_books(outcome_ids="12345")');
    expect(pythonApiReference).not.toContain('exchange.create_order()');
    expect(pythonApiReference).not.toContain('exchange.build_order()');
    expect(pythonApiReference).not.toContain('exchange.submit_order(built="...")');
    expect(pythonApiReference).not.toContain('List[string]');
    expect(pythonApiReference).not.toContain('Dictstr, [OrderBook]');

    expect(typescriptApiReference).toContain('await exchange.fetchOrderBooks(["12345"])');
    expect(typescriptApiReference).toContain(`await exchange.createOrder({
  marketId: "12345",
  outcomeId: "abc123",
  side: "buy",
  type: "limit",
  amount: 50,
  price: 0.65
})`);
    expect(typescriptApiReference).toContain(`const built = await exchange.buildOrder({
  marketId: "12345",
  outcomeId: "abc123",
  side: "buy",
  type: "limit",
  amount: 50,
  price: 0.65
});
await exchange.submitOrder(built)`);

    expect(pythonApiReference).toContain('exchange.fetch_order_books(outcome_ids=["12345"])');
    expect(pythonApiReference).toContain(
      'def fetch_order_books(outcome_ids: List[str]) -> Dict[str, OrderBook]:',
    );
    expect(pythonApiReference).toContain(`exchange.create_order(
    market_id="12345",
    outcome_id="abc123",
    side="buy",
    type="limit",
    amount=50,
    price=0.65,
)`);
    expect(pythonApiReference).toContain(`built = exchange.build_order(
    market_id="12345",
    outcome_id="abc123",
    side="buy",
    type="limit",
    amount=50,
    price=0.65,
)
exchange.submit_order(built)`);
  });

  test('SDK API reference positional examples match SDK method signatures', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchOrderBook("abc123", { limit: 10, params: "..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchOpenOrders({ marketId: "12345" })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchPositions({ address: "0xabc..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchBalance({ address: "0xabc..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchOrderBook("abc123", "...", { limit: 10 })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchOrderBooks(["12345"], "...", { limit: 10 })',
    );

    expect(pythonApiReference).not.toContain(
      'exchange.fetch_order_book(outcome_id="abc123", limit=10, params="...")',
    );
    expect(pythonApiReference).not.toContain(
      'exchange.watch_order_book(outcome_id="abc123", params="...", limit=10)',
    );
    expect(pythonApiReference).not.toContain(
      'exchange.watch_order_books(outcome_ids=["12345"], params="...", limit=10)',
    );

    expect(typescriptApiReference).toContain('await exchange.fetchOrderBook("abc123", 10, {})');
    expect(typescriptApiReference).toContain('await exchange.fetchOpenOrders("12345")');
    expect(typescriptApiReference).toContain('await exchange.fetchPositions("0xabc...")');
    expect(typescriptApiReference).toContain('await exchange.fetchBalance("0xabc...")');
    expect(typescriptApiReference).toContain('await exchange.watchOrderBook("abc123", 10, {})');
    expect(typescriptApiReference).toContain(
      'await exchange.watchOrderBooks(["12345"], 10, {})',
    );

    expect(pythonApiReference).toContain(
      'exchange.fetch_order_book(outcome_id="abc123", limit=10, params={})',
    );
    expect(pythonApiReference).toContain(
      'exchange.watch_order_book(outcome_id="abc123", limit=10, params={})',
    );
    expect(pythonApiReference).toContain(
      'exchange.watch_order_books(outcome_ids=["12345"], limit=10, params={})',
    );
  });

  test('SDK API reference object and list examples avoid string placeholders', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('await exchange.fetchOHLCV("abc123", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.fetchTrades("abc123", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.getExecutionPrice("...", "buy", 50)');
    expect(typescriptApiReference).not.toContain(
      'await exchange.getExecutionPriceDetailed("...", "buy", 50)',
    );
    expect(typescriptApiReference).not.toContain('await exchange.filterMarkets("...", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.filterEvents("...", "...")');
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchTrades("abc123", { address: "0xabc...", since: "..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchAddress("0xabc...", { types: "..." })',
    );

    expect(pythonApiReference).not.toContain('exchange.fetch_ohlcv(outcome_id="abc123", params="...")');
    expect(pythonApiReference).not.toContain('exchange.fetch_trades(outcome_id="abc123", params="...")');
    expect(pythonApiReference).not.toContain(
      'exchange.get_execution_price(order_book="...", side="buy", amount=50)',
    );
    expect(pythonApiReference).not.toContain(
      'exchange.get_execution_price_detailed(order_book="...", side="buy", amount=50)',
    );
    expect(pythonApiReference).not.toContain('exchange.filter_markets(markets="...", criteria="...")');
    expect(pythonApiReference).not.toContain('exchange.filter_events(events="...", criteria="...")');
    expect(pythonApiReference).not.toContain('exchange.watch_trades(outcome_id="abc123", address="0xabc...", since="...")');
    expect(pythonApiReference).not.toContain('exchange.watch_address(address="0xabc...", types="...")');

    expect(typescriptApiReference).toContain(
      'await exchange.fetchOHLCV("abc123", { resolution: "1h", limit: 100 })',
    );
    expect(typescriptApiReference).toContain('await exchange.fetchTrades("abc123", { limit: 50 })');
    expect(typescriptApiReference).toContain(`const orderBook = await exchange.fetchOrderBook("abc123")
await exchange.getExecutionPrice(orderBook, "buy", 50)`);
    expect(typescriptApiReference).toContain(`const orderBook = await exchange.fetchOrderBook("abc123")
await exchange.getExecutionPriceDetailed(orderBook, "buy", 50)`);
    expect(typescriptApiReference).toContain(`const markets = await exchange.fetchMarkets({ query: "Trump" })
await exchange.filterMarkets(markets, "Trump")`);
    expect(typescriptApiReference).toContain(`const events = await exchange.fetchEvents({ query: "Trump" })
await exchange.filterEvents(events, "Trump")`);
    expect(typescriptApiReference).toContain(
      'await exchange.watchTrades("abc123", "0xabc...", 1710000000000, 50)',
    );
    expect(typescriptApiReference).toContain('await exchange.watchAddress("0xabc...", ["trades"])');

    expect(pythonApiReference).toContain(
      'exchange.fetch_ohlcv(outcome_id="abc123", resolution="1h", limit=100)',
    );
    expect(pythonApiReference).toContain('exchange.fetch_trades(outcome_id="abc123", limit=50)');
    expect(pythonApiReference).toContain(`order_book = exchange.fetch_order_book(outcome_id="abc123")
exchange.get_execution_price(order_book=order_book, side="buy", amount=50)`);
    expect(pythonApiReference).toContain(`order_book = exchange.fetch_order_book(outcome_id="abc123")
exchange.get_execution_price_detailed(order_book=order_book, side="buy", amount=50)`);
    expect(pythonApiReference).toContain(`markets = exchange.fetch_markets(query="Trump")
exchange.filter_markets(markets=markets, criteria="Trump")`);
    expect(pythonApiReference).toContain(`events = exchange.fetch_events(query="Trump")
exchange.filter_events(events=events, criteria="Trump")`);
    expect(pythonApiReference).toContain(
      'exchange.watch_trades(outcome_id="abc123", address="0xabc...", since=1710000000000, limit=50)',
    );
    expect(pythonApiReference).toContain('exchange.watch_address(address="0xabc...", types=["trades"])');
  });

  test('SDK API reference callback examples pass callables', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('await exchange.watchPrices("...", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.watchUserPositions("...")');
    expect(typescriptApiReference).not.toContain('await exchange.watchUserTransactions("...")');

    expect(pythonApiReference).not.toContain(
      'exchange.watch_prices(market_address="...", callback="...")',
    );
    expect(pythonApiReference).not.toContain('exchange.watch_user_positions(callback="...")');
    expect(pythonApiReference).not.toContain('exchange.watch_user_transactions(callback="...")');
    expect(typescriptApiReference).not.toContain('callback: (data: any)): Promise<void>');
    expect(pythonApiReference).not.toContain('callback: (data: any)');
    expect(pythonApiReference).not.toContain('-> void:');

    expect(typescriptApiReference).toContain(
      'await exchange.watchPrices("0xabc...", (data) => { void data })',
    );
    expect(typescriptApiReference).toContain(
      'await exchange.watchUserPositions((data) => { void data })',
    );
    expect(typescriptApiReference).toContain(
      'await exchange.watchUserTransactions((data) => { void data })',
    );

    expect(pythonApiReference).toContain(`def handle_price_update(data):
    pass
exchange.watch_prices(market_address="0xabc...", callback=handle_price_update)`);
    expect(pythonApiReference).toContain(`def handle_position_update(data):
    pass
exchange.watch_user_positions(callback=handle_position_update)`);
    expect(pythonApiReference).toContain(`def handle_transaction_update(data):
    pass
exchange.watch_user_transactions(callback=handle_transaction_update)`);
    expect(pythonApiReference).toContain(
      'def watch_prices(market_address: str, callback: Callable[[Any], None]) -> None:',
    );
    expect(typescriptApiReference).toContain(
      'async watchPrices(marketAddress: string, callback: (data: any) => void): Promise<void>',
    );
  });

  test('Python API reference signatures render Python-native types', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');

    expect(pythonApiReference).not.toContain(
      'Optional[{ limit?: number; cursor?: string; filter?: MarketFilterCriteria }]',
    );
    expect(pythonApiReference).not.toContain('string | MarketFilterCriteria');
    expect(pythonApiReference).not.toContain('UnifiedEvent | null');
    expect(pythonApiReference).not.toContain("side: 'buy' | 'sell'");
    expect(pythonApiReference).not.toContain('get_event_byid');
    expect(pythonApiReference).not.toContain('get_event_byslug');

    expect(pythonApiReference).toContain(
      'def fetch_markets_paginated(params: Optional[dict] = None) -> PaginatedMarketsResult:',
    );
    expect(pythonApiReference).toContain(
      'def fetch_events_paginated(params: Optional[dict] = None) -> PaginatedEventsResult:',
    );
    expect(pythonApiReference).toContain(
      'def filter_markets(markets: List[UnifiedMarket], criteria: Union[str, MarketFilterCriteria, MarketFilterFunction]) -> List[UnifiedMarket]:',
    );
    expect(pythonApiReference).toContain(
      'def filter_events(events: List[UnifiedEvent], criteria: Union[str, EventFilterCriteria, EventFilterFunction]) -> List[UnifiedEvent]:',
    );
    expect(pythonApiReference).toContain(
      'def get_execution_price(order_book: OrderBook, side: Literal["buy", "sell"], amount: float) -> float:',
    );
    expect(pythonApiReference).toContain(
      'def get_event_by_id(id: str) -> Optional[UnifiedEvent]:',
    );
    expect(pythonApiReference).toContain(
      'def get_event_by_slug(slug: str) -> Optional[UnifiedEvent]:',
    );
  });

  test('SDK API reference getter docs use property access', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('async has(): Promise<ExchangeHas>');
    expect(typescriptApiReference).not.toContain('await exchange.has()');
    expect(typescriptApiReference).not.toContain('### `implicitApi`');

    expect(pythonApiReference).not.toContain('def has() -> ExchangeHas:');
    expect(pythonApiReference).not.toContain('exchange.has()');
    expect(pythonApiReference).not.toContain('### `implicit_api`');

    expect(typescriptApiReference).toContain('get has(): ExchangeHas');
    expect(typescriptApiReference).toContain('exchange.has');
    expect(pythonApiReference).toContain('has: ExchangeHas');
    expect(pythonApiReference).toContain('exchange.has');
  });
});
