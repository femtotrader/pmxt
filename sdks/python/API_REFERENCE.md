# PMXT Python SDK - API Reference

A unified Python interface for interacting with multiple prediction market exchanges (Polymarket, Kalshi, Limitless) identically.

## Installation

```bash
pip install pmxt
```

## Quick Start

```python
import pmxt

# Initialize exchanges (server starts automatically!)
poly = pmxt.Polymarket()
kalshi = pmxt.Kalshi()
limitless = pmxt.Limitless()  # Requires API key for authenticated operations

# Search for markets
markets = poly.fetch_markets(query="Trump")
print(markets[0].title)
```

> **Note**: This SDK automatically manages the PMXT sidecar server. Just import and use!

---

## Server Management

The SDK provides global functions to manage the background sidecar server. This is useful for clearing state, resolving "port busy" errors, or ensuring a clean slate in interactive environments like Jupyter.

### `stop_server`

Stop the background PMXT sidecar server and clean up lock files.

```python
import pmxt
pmxt.stop_server()
```

### `restart_server`

Restart the background PMXT sidecar server. Equivalent to calling `stop_server()` followed by a fresh start.

```python
import pmxt
pmxt.restart_server()
```

---

## Methods

### `fetch_markets`

Fetch markets with optional filtering, search, or slug lookup.


**Signature:**

```python
def fetch_markets(params: Optional[MarketFetchParams] = None) -> List[UnifiedMarket]:
```

**Parameters:**

- `params` (MarketFetchParams) - **Optional**: Optional parameters for filtering and search
  - `params.query` - Search keyword to filter markets
  - `params.slug` - Market slug/ticker for direct lookup
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.sort` - Sort order ('volume' | 'liquidity' | 'newest')
  - `params.search_in` - Where to search ('title' | 'description' | 'both')

**Returns:** `List[UnifiedMarket]` - Array of unified markets

**Example:**

```python
# Fetch markets
markets = exchange.fetch_markets(query='Trump', limit=20)
print(markets[0].title)

# Get market by slug
markets = exchange.fetch_markets(slug='will-trump-win')
```


---
### `fetch_events`

Fetch events with optional keyword search.


**Signature:**

```python
def fetch_events(params: Optional[EventFetchParams] = None) -> List[UnifiedEvent]:
```

**Parameters:**

- `params` (EventFetchParams) - **Optional**: Optional parameters for search and filtering
  - `params.query` - Search keyword to filter events (required)
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.search_in` - Where to search ('title' | 'description' | 'both')

**Returns:** `List[UnifiedEvent]` - Array of unified events

**Example:**

```python
# Search events
events = exchange.fetch_events(query='Fed Chair')
fed_event = events[0]
print(fed_event.title, len(fed_event.markets), 'markets')
```


---
### `fetch_ohlcv`

Fetch historical OHLCV (candlestick) price data for a specific market outcome.


**Signature:**

```python
def fetch_ohlcv(id: str, params: OHLCVParams | HistoryFilterParams) -> List[PriceCandle]:
```

**Parameters:**

- `id` (str): The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
- `params` (OHLCVParams | HistoryFilterParams): OHLCV parameters including resolution (required)

**Returns:** `List[PriceCandle]` - Array of price candles

**Example:**

```python
# Fetch hourly candles
markets = exchange.fetch_markets(query='Trump')
outcome_id = markets[0].yes.outcome_id
candles = exchange.fetch_ohlcv(outcome_id, resolution='1h', limit=100)
print(f"Latest close: {candles[-1].close}")
```

**Notes:**
**CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
Resolution options: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'

---
### `fetch_order_book`

Fetch the current order book (bids/asks) for a specific outcome.


**Signature:**

```python
def fetch_order_book(id: str) -> OrderBook:
```

**Parameters:**

- `id` (str): The Outcome ID (outcomeId)

**Returns:** `OrderBook` - Current order book with bids and asks

**Example:**

```python
# Fetch order book
book = exchange.fetch_order_book(outcome.outcome_id)
print(f"Best bid: {book.bids[0].price}")
print(f"Best ask: {book.asks[0].price}")
print(f"Spread: {(book.asks[0].price - book.bids[0].price) * 100:.2f}%")
```


---
### `fetch_trades`

Fetch raw trade history for a specific outcome.


**Signature:**

```python
def fetch_trades(id: str, params: TradesParams | HistoryFilterParams) -> List[Trade]:
```

**Parameters:**

- `id` (str): The Outcome ID (outcomeId)
- `params` (TradesParams | HistoryFilterParams): Trade filter parameters

**Returns:** `List[Trade]` - Array of recent trades

**Example:**

```python
# Fetch recent trades
trades = exchange.fetch_trades(outcome.outcome_id, limit=100)
for trade in trades:
    print(f"{trade.side} {trade.amount} @ {trade.price}")
```

**Notes:**
Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.

---
### `create_order`

Place a new order on the exchange.


**Signature:**

```python
def create_order(params: CreateOrderParams) -> Order:
```

**Parameters:**

- `params` (CreateOrderParams): Order parameters

**Returns:** `Order` - The created order

**Example:**

```python
# Place a limit order
order = exchange.create_order(
    market_id=market.market_id,
    outcome_id=market.yes.outcome_id,
    side='buy',
    type='limit',
    amount=10,
    price=0.55
)
print(f"Order {order.id}: {order.status}")

# Place a market order
order = exchange.create_order(
    market_id=market.market_id,
    outcome_id=market.yes.outcome_id,
    side='buy',
    type='market',
    amount=5
)
```


---
### `cancel_order`

Cancel an existing open order.


**Signature:**

```python
def cancel_order(order_id: str) -> Order:
```

**Parameters:**

- `order_id` (str): The order ID to cancel

**Returns:** `Order` - The cancelled order

**Example:**

```python
# Cancel an order
cancelled = exchange.cancel_order('order-123')
print(cancelled.status)  # 'cancelled'
```


---
### `fetch_order`

Fetch a specific order by ID.


**Signature:**

```python
def fetch_order(order_id: str) -> Order:
```

**Parameters:**

- `order_id` (str): The order ID to look up

**Returns:** `Order` - The order details

**Example:**

```python
# Fetch order status
order = exchange.fetch_order('order-456')
print(f"Filled: {order.filled}/{order.amount}")
```


---
### `fetch_open_orders`

Fetch all open orders, optionally filtered by market.


**Signature:**

```python
def fetch_open_orders(market_id: Optional[str] = None) -> List[Order]:
```

**Parameters:**

- `market_id` (str) - **Optional**: Optional market ID to filter by

**Returns:** `List[Order]` - Array of open orders

**Example:**

```python
# Fetch all open orders
orders = exchange.fetch_open_orders()
for order in orders:
    print(f"{order.side} {order.amount} @ {order.price}")

# Fetch orders for a specific market
orders = exchange.fetch_open_orders('FED-25JAN')
```


---
### `fetch_positions`

Fetch current user positions across all markets.


**Signature:**

```python
def fetch_positions() -> List[Position]:
```

**Parameters:**

- None

**Returns:** `List[Position]` - Array of user positions

**Example:**

```python
# Fetch positions
positions = exchange.fetch_positions()
for pos in positions:
    print(f"{pos.outcome_label}: {pos.size} @ ${pos.entry_price}")
    print(f"Unrealized P&L: ${pos.unrealized_pnl:.2f}")
```


---
### `fetch_balance`

Fetch account balances.


**Signature:**

```python
def fetch_balance() -> List[Balance]:
```

**Parameters:**

- None

**Returns:** `List[Balance]` - Array of account balances

**Example:**

```python
# Fetch balance
balances = exchange.fetch_balance()
print(f"Available: ${balances[0].available}")
```


---
### `get_execution_price`

Calculate the volume-weighted average execution price for a given order size.


**Signature:**

```python
def get_execution_price(order_book: OrderBook, side: 'buy' | 'sell', amount: float) -> float:
```

**Parameters:**

- `order_book` (OrderBook): The current order book
- `side` ('buy' | 'sell'): 'buy' or 'sell'
- `amount` (float): Number of contracts to simulate

**Returns:** `float` - Average execution price, or 0 if insufficient liquidity

**Example:**

```python
# Get execution price
book = exchange.fetch_order_book(outcome.outcome_id)
price = exchange.get_execution_price(book, 'buy', 100)
print(f"Avg price for 100 contracts: {price}")
```


---
### `get_execution_price_detailed`

Calculate detailed execution price information including partial fill data.


**Signature:**

```python
def get_execution_price_detailed(order_book: OrderBook, side: 'buy' | 'sell', amount: float) -> ExecutionPriceResult:
```

**Parameters:**

- `order_book` (OrderBook): The current order book
- `side` ('buy' | 'sell'): 'buy' or 'sell'
- `amount` (float): Number of contracts to simulate

**Returns:** `ExecutionPriceResult` - Detailed execution result with price, filled amount, and fill status

**Example:**

```python
# Get detailed execution price
book = exchange.fetch_order_book(outcome.outcome_id)
result = exchange.get_execution_price_detailed(book, 'buy', 100)
print(f"Price: {result.price}")
print(f"Filled: {result.filled_amount}/100")
print(f"Fully filled: {result.fully_filled}")
```


---
### `filter_markets`

Filter a list of markets by criteria.


**Signature:**

```python
def filter_markets(markets: List[UnifiedMarket], criteria: string | MarketFilterCriteria | MarketFilterFunction) -> List[UnifiedMarket]:
```

**Parameters:**

- `markets` (List[UnifiedMarket]): Array of markets to filter
- `criteria` (string | MarketFilterCriteria | MarketFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

**Returns:** `List[UnifiedMarket]` - Filtered array of markets

**Example:**

```python
# Simple text search
filtered = exchange.filter_markets(markets, 'Trump')

# Advanced criteria
undervalued = exchange.filter_markets(markets, {
    'text': 'Election',
    'volume_24h': {'min': 10000},
    'price': {'outcome': 'yes', 'max': 0.4}
})

# Custom predicate
volatile = exchange.filter_markets(markets,
    lambda m: m.yes and m.yes.price_change_24h < -0.1
)
```


---
### `filter_events`

Filter a list of events by criteria.


**Signature:**

```python
def filter_events(events: List[UnifiedEvent], criteria: string | EventFilterCriteria | EventFilterFunction) -> List[UnifiedEvent]:
```

**Parameters:**

- `events` (List[UnifiedEvent]): Array of events to filter
- `criteria` (string | EventFilterCriteria | EventFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

**Returns:** `List[UnifiedEvent]` - Filtered array of events

**Example:**

```python
# Filter by category
filtered = exchange.filter_events(events, {
    'category': 'Politics',
    'market_count': {'min': 5}
})
```


---
### `watch_order_book`

Watch order book updates in real-time via WebSocket.


**Signature:**

```python
def watch_order_book(id: str, limit: Optional[float] = None) -> OrderBook:
```

**Parameters:**

- `id` (str): The Outcome ID to watch
- `limit` (float) - **Optional**: Optional limit for orderbook depth

**Returns:** `OrderBook` - Promise that resolves with the current orderbook state

**Example:**

```python
# Stream order book
while True:
    book = exchange.watch_order_book(outcome.outcome_id)
    print(f"Bid: {book.bids[0].price} Ask: {book.asks[0].price}")
```


---
### `watch_trades`

Watch trade executions in real-time via WebSocket.


**Signature:**

```python
def watch_trades(id: str, since: Optional[float] = None, limit: Optional[float] = None) -> List[Trade]:
```

**Parameters:**

- `id` (str): The Outcome ID to watch
- `since` (float) - **Optional**: Optional timestamp to filter trades from
- `limit` (float) - **Optional**: Optional limit for number of trades

**Returns:** `List[Trade]` - Promise that resolves with recent trades

**Example:**

```python
# Stream trades
while True:
    trades = exchange.watch_trades(outcome.outcome_id)
    for trade in trades:
        print(f"{trade.side} {trade.amount} @ {trade.price}")
```


---
### `close`

Close all WebSocket connections and clean up resources.


**Signature:**

```python
def close() -> void:
```

**Parameters:**

- None

**Returns:** `void` - Result

**Example:**

```python
# Close connections
exchange.close()
```


---
### `watch_prices`

Watch AMM price updates for a market address (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```python
def watch_prices(market_address: str, callback: (data: any)) -> void:
```

**Parameters:**

- `market_address` (str): Market contract address
- `callback` ((data: any)): Callback for price updates

**Returns:** `void` - Result

**Example:**

```python
# Watch prices
exchange.watch_prices(market_address, callback=lambda data: print('Price update:', data))
```


---
### `watch_user_positions`

Watch user positions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```python
def watch_user_positions(callback: (data: any)) -> void:
```

**Parameters:**

- `callback` ((data: any)): Callback for position updates

**Returns:** `void` - Result

**Example:**

```python
# Watch positions
exchange.watch_user_positions(callback=lambda data: print('Position update:', data))
```


---
### `watch_user_transactions`

Watch user transactions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```python
def watch_user_transactions(callback: (data: any)) -> void:
```

**Parameters:**

- `callback` ((data: any)): Callback for transaction updates

**Returns:** `void` - Result

**Example:**

```python
# Watch transactions
exchange.watch_user_transactions(callback=lambda data: print('Transaction:', data))
```


---

## Complete Trading Workflow

```python
import pmxt
import os

exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY')
)

# 1. Check balance
balances = exchange.fetch_balance()
if balances:
    balance = balances[0]
    print(f'Available: ${balance.available}')

# 2. Search for a market
markets = exchange.fetch_markets(query='Trump')
market = markets[0]
outcome = market.yes

print(f'{market.title}')
print(f'Price: {outcome.price * 100:.1f}%')

# 3. Place a limit order
order = exchange.create_order(
    market_id=market.market_id,
    outcome_id=outcome.outcome_id,
    side='buy',
    type='limit',
    amount=10,
    price=0.50
)

print(f'Order placed: {order.id}')

# 4. Check order status
updated_order = exchange.fetch_order(order.id)
print(f'Status: {updated_order.status}')
print(f'Filled: {updated_order.filled}/{updated_order.amount}')

# 5. Cancel if needed
if updated_order.status == 'open':
    exchange.cancel_order(order.id)
    print('Order cancelled')

# 6. Check positions
positions = exchange.fetch_positions()
for pos in positions:
    pnl_sign = '+' if pos.unrealized_pnl > 0 else ''
    print(f'{pos.outcome_label}: {pnl_sign}${pos.unrealized_pnl:.2f}')
```

## Data Models

### `UnifiedMarket`



```python
@dataclass
class UnifiedMarket:
market_id: str # The unique identifier for this market
title: str # 
description: str # 
outcomes: List[MarketOutcome] # 
resolution_date: str # 
volume24h: float # 
volume: float # 
liquidity: float # 
open_interest: float # 
url: str # 
image: str # 
category: str # 
tags: List[string] # 
yes: MarketOutcome # 
no: MarketOutcome # 
up: MarketOutcome # 
down: MarketOutcome # 
```

---
### `MarketOutcome`



```python
@dataclass
class MarketOutcome:
outcome_id: str # Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)
market_id: str # The market this outcome belongs to (set automatically)
label: str # 
price: float # 
price_change24h: float # 
metadata: object # Exchange-specific metadata (e.g., clobTokenId for Polymarket)
```

---
### `UnifiedEvent`

A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)

```python
@dataclass
class UnifiedEvent:
id: str # 
title: str # 
description: str # 
slug: str # 
markets: List[UnifiedMarket] # 
url: str # 
image: str # 
category: str # 
tags: List[string] # 
```

---
### `PriceCandle`



```python
@dataclass
class PriceCandle:
timestamp: int # 
open: float # 
high: float # 
low: float # 
close: float # 
volume: float # 
```

---
### `OrderBook`



```python
@dataclass
class OrderBook:
bids: List[OrderLevel] # 
asks: List[OrderLevel] # 
timestamp: int # 
```

---
### `OrderLevel`



```python
@dataclass
class OrderLevel:
price: float # 
size: float # 
```

---
### `Trade`



```python
@dataclass
class Trade:
id: str # 
price: float # 
amount: float # 
side: str # 
timestamp: int # 
```

---
### `Order`



```python
@dataclass
class Order:
id: str # 
market_id: str # 
outcome_id: str # 
side: str # 
type: str # 
price: float # 
amount: float # 
status: str # 
filled: float # 
remaining: float # 
timestamp: int # 
fee: float # 
```

---
### `Position`



```python
@dataclass
class Position:
market_id: str # 
outcome_id: str # 
outcome_label: str # 
size: float # 
entry_price: float # 
current_price: float # 
unrealized_pnl: float # 
realized_pnl: float # 
```

---
### `Balance`



```python
@dataclass
class Balance:
currency: str # 
total: float # 
available: float # 
locked: float # 
```

---
### `ExecutionPriceResult`



```python
@dataclass
class ExecutionPriceResult:
price: float # 
filled_amount: float # 
fully_filled: bool # 
```

---
### `ExchangeCredentials`

Optional authentication credentials for exchange operations

```python
@dataclass
class ExchangeCredentials:
api_key: str # API key for the exchange
private_key: str # Private key for signing transactions
api_secret: str # API secret (if required by exchange)
passphrase: str # Passphrase (if required by exchange)
funder_address: str # The address funding the trades (Proxy address)
signature_type: Any # Signature type (0=EOA, 1=Poly Proxy, 2=Gnosis Safe, or names like 'gnosis_safe')
```

---

## Filter Parameters

### `BaseRequest`

Base request structure with optional credentials

```python
@dataclass
class BaseRequest:
credentials: ExchangeCredentials # 
```

---
### `MarketFilterParams`



```python
@dataclass
class MarketFilterParams:
limit: int # 
offset: int # 
sort: str # 
status: str # Filter by market status (default: active)
search_in: str # 
query: str # 
slug: str # 
market_id: str # Direct lookup by market ID
outcome_id: str # Reverse lookup -- find market containing this outcome
event_id: str # Find markets belonging to an event
page: int # 
similarity_threshold: float # 
```

---
### `EventFetchParams`



```python
@dataclass
class EventFetchParams:
query: str # 
limit: int # 
offset: int # 
status: str # Filter by event status (default: active)
search_in: str # 
event_id: str # Direct lookup by event ID
slug: str # Lookup by event slug
```

---
### `HistoryFilterParams`

Deprecated - use OHLCVParams or TradesParams instead. Resolution is optional for backward compatibility.

```python
@dataclass
class HistoryFilterParams:
resolution: str # 
start: str # 
end: str # 
limit: int # 
```

---
### `OHLCVParams`



```python
@dataclass
class OHLCVParams:
resolution: str # Candle interval for aggregation
start: str # 
end: str # 
limit: int # 
```

---
### `TradesParams`

Parameters for fetching trade history. No resolution parameter - trades are discrete events.

```python
@dataclass
class TradesParams:
start: str # 
end: str # 
limit: int # 
```

---
### `CreateOrderParams`



```python
@dataclass
class CreateOrderParams:
market_id: str # 
outcome_id: str # 
side: str # 
type: str # 
amount: float # 
price: float # 
fee: float # 
```

---
