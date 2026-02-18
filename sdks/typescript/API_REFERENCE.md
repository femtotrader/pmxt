# pmxtjs - API Reference

A unified TypeScript SDK for interacting with multiple prediction market exchanges (Polymarket, Kalshi, Limitless)
identically.

## Installation

```bash
npm install pmxtjs
```

## Quick Start

```typescript
import pmxt from 'pmxtjs';

// Initialize exchanges (server starts automatically!)
const poly = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();
const limitless = new pmxt.Limitless(); // Requires API key for authenticated operations

// Search for markets
const markets = await poly.fetchMarkets({ query: "Trump" });
console.log(markets[0].title);
```

> **Note**: This SDK automatically manages the PMXT sidecar server.

---

## Server Management

The SDK provides global functions to manage the background sidecar server. This is useful for clearing state or
resolving "port busy" errors.

### `stopServer`

Stop the background PMXT sidecar server and clean up lock files.

```typescript
import pmxt from 'pmxtjs';
await pmxt.stopServer();
```

### `restartServer`

Restart the background PMXT sidecar server. Equivalent to calling `stopServer()` followed by a fresh start.

```typescript
import pmxt from 'pmxtjs';
await pmxt.restartServer();
```

---

## Methods

### `fetchMarkets`

Fetch markets with optional filtering, search, or slug lookup.


**Signature:**

```typescript
async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]>
  ```

  **Parameters:**

  - `params` (MarketFetchParams) - **Optional**: Optional parameters for filtering and search
  - `params.query` - Search keyword to filter markets
  - `params.slug` - Market slug/ticker for direct lookup
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.sort` - Sort order ('volume' | 'liquidity' | 'newest')
  - `params.searchIn` - Where to search ('title' | 'description' | 'both')

  **Returns:** `Promise<UnifiedMarket[]>` - Array of unified markets

    **Example:**

    ```typescript
    // Fetch markets
const markets = await exchange.fetchMarkets({ query: 'Trump', limit: 20 });
console.log(markets[0].title);

// Get market by slug
const markets = await exchange.fetchMarkets({ slug: 'will-trump-win' });
    ```


    ---
### `fetchEvents`

Fetch events with optional keyword search.


**Signature:**

```typescript
async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]>
  ```

  **Parameters:**

  - `params` (EventFetchParams) - **Optional**: Optional parameters for search and filtering
  - `params.query` - Search keyword to filter events (required)
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.searchIn` - Where to search ('title' | 'description' | 'both')

  **Returns:** `Promise<UnifiedEvent[]>` - Array of unified events

    **Example:**

    ```typescript
    // Search events
const events = await exchange.fetchEvents({ query: 'Fed Chair' });
const fedEvent = events[0];
console.log(fedEvent.title, fedEvent.markets.length, 'markets');
    ```


    ---
### `fetchOHLCV`

Fetch historical OHLCV (candlestick) price data for a specific market outcome.


**Signature:**

```typescript
async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]>
  ```

  **Parameters:**

  - `id` (string): The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
  - `params` (OHLCVParams | HistoryFilterParams): OHLCV parameters including resolution (required)

  **Returns:** `Promise<PriceCandle[]>` - Array of price candles

    **Example:**

    ```typescript
    // Fetch hourly candles
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const outcomeId = markets[0].yes.outcomeId;
const candles = await exchange.fetchOHLCV(outcomeId, {
  resolution: '1h',
  limit: 100
});
console.log(`Latest close: ${candles[candles.length - 1].close}`);
    ```

    **Notes:**
    **CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
    Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
    Resolution options: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'

    ---
### `fetchOrderBook`

Fetch the current order book (bids/asks) for a specific outcome.


**Signature:**

```typescript
async fetchOrderBook(id: string): Promise<OrderBook>
  ```

  **Parameters:**

  - `id` (string): The Outcome ID (outcomeId)

  **Returns:** `Promise<OrderBook>` - Current order book with bids and asks

    **Example:**

    ```typescript
    // Fetch order book
const book = await exchange.fetchOrderBook(outcome.outcomeId);
console.log(`Best bid: ${book.bids[0].price}`);
console.log(`Best ask: ${book.asks[0].price}`);
console.log(`Spread: ${(book.asks[0].price - book.bids[0].price) * 100}%`);
    ```


    ---
### `fetchTrades`

Fetch raw trade history for a specific outcome.


**Signature:**

```typescript
async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]>
  ```

  **Parameters:**

  - `id` (string): The Outcome ID (outcomeId)
  - `params` (TradesParams | HistoryFilterParams): Trade filter parameters

  **Returns:** `Promise<Trade[]>` - Array of recent trades

    **Example:**

    ```typescript
    // Fetch recent trades
const trades = await exchange.fetchTrades(outcome.outcomeId, { limit: 100 });
for (const trade of trades) {
  console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
}
    ```

    **Notes:**
    Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.

    ---
### `createOrder`

Place a new order on the exchange.


**Signature:**

```typescript
async createOrder(params: CreateOrderParams): Promise<Order>
  ```

  **Parameters:**

  - `params` (CreateOrderParams): Order parameters

  **Returns:** `Promise<Order>` - The created order

    **Example:**

    ```typescript
    // Place a limit order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: market.yes.outcomeId,
  side: 'buy',
  type: 'limit',
  amount: 10,
  price: 0.55
});
console.log(`Order ${order.id}: ${order.status}`);

// Place a market order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: market.yes.outcomeId,
  side: 'buy',
  type: 'market',
  amount: 5
});
    ```


    ---
### `cancelOrder`

Cancel an existing open order.


**Signature:**

```typescript
async cancelOrder(orderId: string): Promise<Order>
  ```

  **Parameters:**

  - `orderId` (string): The order ID to cancel

  **Returns:** `Promise<Order>` - The cancelled order

    **Example:**

    ```typescript
    // Cancel an order
const cancelled = await exchange.cancelOrder('order-123');
console.log(cancelled.status); // 'cancelled'
    ```


    ---
### `fetchOrder`

Fetch a specific order by ID.


**Signature:**

```typescript
async fetchOrder(orderId: string): Promise<Order>
  ```

  **Parameters:**

  - `orderId` (string): The order ID to look up

  **Returns:** `Promise<Order>` - The order details

    **Example:**

    ```typescript
    // Fetch order status
const order = await exchange.fetchOrder('order-456');
console.log(`Filled: ${order.filled}/${order.amount}`);
    ```


    ---
### `fetchOpenOrders`

Fetch all open orders, optionally filtered by market.


**Signature:**

```typescript
async fetchOpenOrders(marketId?: string): Promise<Order[]>
  ```

  **Parameters:**

  - `marketId` (string) - **Optional**: Optional market ID to filter by

  **Returns:** `Promise<Order[]>` - Array of open orders

    **Example:**

    ```typescript
    // Fetch all open orders
const orders = await exchange.fetchOpenOrders();
for (const order of orders) {
  console.log(`${order.side} ${order.amount} @ ${order.price}`);
}

// Fetch orders for a specific market
const orders = await exchange.fetchOpenOrders('FED-25JAN');
    ```


    ---
### `fetchPositions`

Fetch current user positions across all markets.


**Signature:**

```typescript
async fetchPositions(): Promise<Position[]>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Position[]>` - Array of user positions

    **Example:**

    ```typescript
    // Fetch positions
const positions = await exchange.fetchPositions();
for (const pos of positions) {
  console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
  console.log(`Unrealized P&L: $${pos.unrealizedPnL.toFixed(2)}`);
}
    ```


    ---
### `fetchBalance`

Fetch account balances.


**Signature:**

```typescript
async fetchBalance(): Promise<Balance[]>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Balance[]>` - Array of account balances

    **Example:**

    ```typescript
    // Fetch balance
const balances = await exchange.fetchBalance();
console.log(`Available: $${balances[0].available}`);
    ```


    ---
### `getExecutionPrice`

Calculate the volume-weighted average execution price for a given order size.


**Signature:**

```typescript
async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number>
  ```

  **Parameters:**

  - `orderBook` (OrderBook): The current order book
  - `side` ('buy' | 'sell'): 'buy' or 'sell'
  - `amount` (number): Number of contracts to simulate

  **Returns:** `Promise<number>` - Average execution price, or 0 if insufficient liquidity

    **Example:**

    ```typescript
    // Get execution price
const book = await exchange.fetchOrderBook(outcome.outcomeId);
const price = exchange.getExecutionPrice(book, 'buy', 100);
console.log(`Avg price for 100 contracts: ${price}`);
    ```


    ---
### `getExecutionPriceDetailed`

Calculate detailed execution price information including partial fill data.


**Signature:**

```typescript
async getExecutionPriceDetailed(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<ExecutionPriceResult>
  ```

  **Parameters:**

  - `orderBook` (OrderBook): The current order book
  - `side` ('buy' | 'sell'): 'buy' or 'sell'
  - `amount` (number): Number of contracts to simulate

  **Returns:** `Promise<ExecutionPriceResult>` - Detailed execution result with price, filled amount, and fill status

    **Example:**

    ```typescript
    // Get detailed execution price
const book = await exchange.fetchOrderBook(outcome.outcomeId);
const result = exchange.getExecutionPriceDetailed(book, 'buy', 100);
console.log(`Price: ${result.price}`);
console.log(`Filled: ${result.filledAmount}/${100}`);
console.log(`Fully filled: ${result.fullyFilled}`);
    ```


    ---
### `filterMarkets`

Filter a list of markets by criteria.


**Signature:**

```typescript
async filterMarkets(markets: UnifiedMarket[], criteria: string | MarketFilterCriteria | MarketFilterFunction): Promise<UnifiedMarket[]>
  ```

  **Parameters:**

  - `markets` (UnifiedMarket[]): Array of markets to filter
  - `criteria` (string | MarketFilterCriteria | MarketFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

  **Returns:** `Promise<UnifiedMarket[]>` - Filtered array of markets

    **Example:**

    ```typescript
    // Simple text search
const filtered = exchange.filterMarkets(markets, 'Trump');

// Advanced criteria
const undervalued = exchange.filterMarkets(markets, {
  text: 'Election',
  volume24h: { min: 10000 },
  price: { outcome: 'yes', max: 0.4 }
});

// Custom predicate
const volatile = exchange.filterMarkets(markets,
  m => m.yes?.priceChange24h < -0.1
);
    ```


    ---
### `filterEvents`

Filter a list of events by criteria.


**Signature:**

```typescript
async filterEvents(events: UnifiedEvent[], criteria: string | EventFilterCriteria | EventFilterFunction): Promise<UnifiedEvent[]>
  ```

  **Parameters:**

  - `events` (UnifiedEvent[]): Array of events to filter
  - `criteria` (string | EventFilterCriteria | EventFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

  **Returns:** `Promise<UnifiedEvent[]>` - Filtered array of events

    **Example:**

    ```typescript
    // Filter by category
const filtered = exchange.filterEvents(events, {
  category: 'Politics',
  marketCount: { min: 5 }
});
    ```


    ---
### `watchOrderBook`

Watch order book updates in real-time via WebSocket.


**Signature:**

```typescript
async watchOrderBook(id: string, limit?: number): Promise<OrderBook>
  ```

  **Parameters:**

  - `id` (string): The Outcome ID to watch
  - `limit` (number) - **Optional**: Optional limit for orderbook depth

  **Returns:** `Promise<OrderBook>` - Promise that resolves with the current orderbook state

    **Example:**

    ```typescript
    // Stream order book
while (true) {
  const book = await exchange.watchOrderBook(outcome.outcomeId);
  console.log(`Bid: ${book.bids[0]?.price} Ask: ${book.asks[0]?.price}`);
}
    ```


    ---
### `watchTrades`

Watch trade executions in real-time via WebSocket.


**Signature:**

```typescript
async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]>
  ```

  **Parameters:**

  - `id` (string): The Outcome ID to watch
  - `since` (number) - **Optional**: Optional timestamp to filter trades from
  - `limit` (number) - **Optional**: Optional limit for number of trades

  **Returns:** `Promise<Trade[]>` - Promise that resolves with recent trades

    **Example:**

    ```typescript
    // Stream trades
while (true) {
  const trades = await exchange.watchTrades(outcome.outcomeId);
  for (const trade of trades) {
    console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
  }
}
    ```


    ---
### `close`

Close all WebSocket connections and clean up resources.


**Signature:**

```typescript
async close(): Promise<void>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<void>` - Result

    **Example:**

    ```typescript
    // Close connections
await exchange.close();
    ```


    ---
### `watchPrices`

Watch AMM price updates for a market address (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchPrices(marketAddress: string, callback: (data: any)): Promise<void>
  ```

  **Parameters:**

  - `marketAddress` (string): Market contract address
  - `callback` ((data: any)): Callback for price updates

  **Returns:** `Promise<void>` - Result

    **Example:**

    ```typescript
    // Watch prices
await exchange.watchPrices(marketAddress, (data) => {
  console.log('Price update:', data);
});
    ```


    ---
### `watchUserPositions`

Watch user positions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchUserPositions(callback: (data: any)): Promise<void>
  ```

  **Parameters:**

  - `callback` ((data: any)): Callback for position updates

  **Returns:** `Promise<void>` - Result

    **Example:**

    ```typescript
    // Watch positions
await exchange.watchUserPositions((data) => {
  console.log('Position update:', data);
});
    ```


    ---
### `watchUserTransactions`

Watch user transactions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchUserTransactions(callback: (data: any)): Promise<void>
  ```

  **Parameters:**

  - `callback` ((data: any)): Callback for transaction updates

  **Returns:** `Promise<void>` - Result

    **Example:**

    ```typescript
    // Watch transactions
await exchange.watchUserTransactions((data) => {
  console.log('Transaction:', data);
});
    ```


    ---

    ## Complete Trading Workflow

    ```typescript
    import pmxt from 'pmxtjs';

const exchange = new pmxt.Polymarket({
  privateKey: process.env.POLYMARKET_PRIVATE_KEY
});

// 1. Check balance
const [balance] = await exchange.fetchBalance();
console.log(`Available: $${balance.available}`);

// 2. Search for a market
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const market = markets[0];
const outcome = market.yes;

console.log(market.title);
console.log(`Price: ${(outcome.price * 100).toFixed(1)}%`);

// 3. Place a limit order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: outcome.outcomeId,
  side: 'buy',
  type: 'limit',
  amount: 10,
  price: 0.50
});

console.log(`Order placed: ${order.id}`);

// 4. Check order status
const updatedOrder = await exchange.fetchOrder(order.id);
console.log(`Status: ${updatedOrder.status}`);
console.log(`Filled: ${updatedOrder.filled}/${updatedOrder.amount}`);

// 5. Cancel if needed
if (updatedOrder.status === 'open') {
  await exchange.cancelOrder(order.id);
  console.log('Order cancelled');
}

// 6. Check positions
const positions = await exchange.fetchPositions();
positions.forEach(pos => {
  console.log(`${pos.outcomeLabel}: ${pos.unrealizedPnL > 0 ? '+' : ''}$${pos.unrealizedPnL.toFixed(2)}`);
});
    ```

    ## Data Models

    ### `UnifiedMarket`

    

    ```typescript
    interface UnifiedMarket {
    marketId: string; // The unique identifier for this market
    title: string; // 
    description: string; // 
    outcomes: MarketOutcome[]; // 
    resolutionDate: string; // 
    volume24h: number; // 
    volume: number; // 
    liquidity: number; // 
    openInterest: number; // 
    url: string; // 
    image: string; // 
    category: string; // 
    tags: string[]; // 
    yes: MarketOutcome; // 
    no: MarketOutcome; // 
    up: MarketOutcome; // 
    down: MarketOutcome; // 
    }
    ```

    ---
    ### `MarketOutcome`

    

    ```typescript
    interface MarketOutcome {
    outcomeId: string; // Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)
    marketId: string; // The market this outcome belongs to (set automatically)
    label: string; // 
    price: number; // 
    priceChange24h: number; // 
    metadata: object; // Exchange-specific metadata (e.g., clobTokenId for Polymarket)
    }
    ```

    ---
    ### `UnifiedEvent`

    A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)

    ```typescript
    interface UnifiedEvent {
    id: string; // 
    title: string; // 
    description: string; // 
    slug: string; // 
    markets: UnifiedMarket[]; // 
    url: string; // 
    image: string; // 
    category: string; // 
    tags: string[]; // 
    }
    ```

    ---
    ### `PriceCandle`

    

    ```typescript
    interface PriceCandle {
    timestamp: number; // 
    open: number; // 
    high: number; // 
    low: number; // 
    close: number; // 
    volume: number; // 
    }
    ```

    ---
    ### `OrderBook`

    

    ```typescript
    interface OrderBook {
    bids: OrderLevel[]; // 
    asks: OrderLevel[]; // 
    timestamp: number; // 
    }
    ```

    ---
    ### `OrderLevel`

    

    ```typescript
    interface OrderLevel {
    price: number; // 
    size: number; // 
    }
    ```

    ---
    ### `Trade`

    

    ```typescript
    interface Trade {
    id: string; // 
    price: number; // 
    amount: number; // 
    side: string; // 
    timestamp: number; // 
    }
    ```

    ---
    ### `Order`

    

    ```typescript
    interface Order {
    id: string; // 
    marketId: string; // 
    outcomeId: string; // 
    side: string; // 
    type: string; // 
    price: number; // 
    amount: number; // 
    status: string; // 
    filled: number; // 
    remaining: number; // 
    timestamp: number; // 
    fee: number; // 
    }
    ```

    ---
    ### `Position`

    

    ```typescript
    interface Position {
    marketId: string; // 
    outcomeId: string; // 
    outcomeLabel: string; // 
    size: number; // 
    entryPrice: number; // 
    currentPrice: number; // 
    unrealizedPnL: number; // 
    realizedPnL: number; // 
    }
    ```

    ---
    ### `Balance`

    

    ```typescript
    interface Balance {
    currency: string; // 
    total: number; // 
    available: number; // 
    locked: number; // 
    }
    ```

    ---
    ### `ExecutionPriceResult`

    

    ```typescript
    interface ExecutionPriceResult {
    price: number; // 
    filledAmount: number; // 
    fullyFilled: boolean; // 
    }
    ```

    ---
    ### `ExchangeCredentials`

    Optional authentication credentials for exchange operations

    ```typescript
    interface ExchangeCredentials {
    apiKey: string; // API key for the exchange
    privateKey: string; // Private key for signing transactions
    apiSecret: string; // API secret (if required by exchange)
    passphrase: string; // Passphrase (if required by exchange)
    funderAddress: string; // The address funding the trades (Proxy address)
    signatureType: any; // Signature type (0=EOA, 1=Poly Proxy, 2=Gnosis Safe, or names like 'gnosis_safe')
    }
    ```

    ---

    ## Filter Parameters

    ### `BaseRequest`

    Base request structure with optional credentials

    ```typescript
    interface BaseRequest {
    credentials?: ExchangeCredentials; // 
    }
    ```

    ---
    ### `MarketFilterParams`

    

    ```typescript
    interface MarketFilterParams {
    limit?: number; // 
    offset?: number; // 
    sort?: string; // 
    status?: string; // Filter by market status (default: active)
    searchIn?: string; // 
    query?: string; // 
    slug?: string; // 
    marketId?: string; // Direct lookup by market ID
    outcomeId?: string; // Reverse lookup -- find market containing this outcome
    eventId?: string; // Find markets belonging to an event
    page?: number; // 
    similarityThreshold?: number; // 
    }
    ```

    ---
    ### `EventFetchParams`

    

    ```typescript
    interface EventFetchParams {
    query?: string; // 
    limit?: number; // 
    offset?: number; // 
    status?: string; // Filter by event status (default: active)
    searchIn?: string; // 
    eventId?: string; // Direct lookup by event ID
    slug?: string; // Lookup by event slug
    }
    ```

    ---
    ### `HistoryFilterParams`

    Deprecated - use OHLCVParams or TradesParams instead. Resolution is optional for backward compatibility.

    ```typescript
    interface HistoryFilterParams {
    resolution?: string; // 
    start?: string; // 
    end?: string; // 
    limit?: number; // 
    }
    ```

    ---
    ### `OHLCVParams`

    

    ```typescript
    interface OHLCVParams {
    resolution: string; // Candle interval for aggregation
    start?: string; // 
    end?: string; // 
    limit?: number; // 
    }
    ```

    ---
    ### `TradesParams`

    Parameters for fetching trade history. No resolution parameter - trades are discrete events.

    ```typescript
    interface TradesParams {
    start?: string; // 
    end?: string; // 
    limit?: number; // 
    }
    ```

    ---
    ### `CreateOrderParams`

    

    ```typescript
    interface CreateOrderParams {
    marketId: string; // 
    outcomeId: string; // 
    side: string; // 
    type: string; // 
    amount: number; // 
    price?: number; // 
    fee?: number; // 
    }
    ```

    ---
