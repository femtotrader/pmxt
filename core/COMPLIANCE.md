# Feature Support & Compliance

This document details the feature support and compliance status for each exchange. PMXT enforces a strict compliance standard to ensure protocol consistency across all implementations.

## Functions Status

| Category | Function | Polymarket | Kalshi | Limitless | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Identity** | `name` | ✅ | ✅ | ✅ | |
| **Market Data** | `fetchMarkets` | ✅ | ✅ | ❌ | Limitless fails if no outcomes found |
| | `searchMarkets` | ✅ | ✅ | ✅ | |
| | `getMarketsBySlug` | ✅ | ✅ | ✅ | |
| | `searchEvents` | ✅ | ✅ | ✅ | |
| **Public Data** | `fetchOHLCV` | ✅ | ✅ | ❌ | Limitless fails if no candles found |
| | `fetchOrderBook` | ✅ | ✅ | ✅ | |
| | `fetchTrades` | ❌ | ✅ | ❌ | Polymarket/Limitless fail if no trades found |
| **Private Data** | `fetchBalance` | ✅ | ✅ | ✅ | Verified (Real API calls, balances fetched) |
| | `fetchPositions` | ✅ | ✅ | ✅ | Verified (Empty results pass for private data) |
| **Trading** | `createOrder` | ✅ | ✅ | ❌ | Poly/Kalshi Verified (Funds); Limitless blocked by CLOB lib bug |
| | `cancelOrder` | ⚠️ | ⚠️ | ⚠️ | Tests exist but likely failing Auth/IDs |
| | `fetchOrder` | ⚠️ | ⚠️ | ⚠️ | Tests exist but likely failing Auth/IDs |
| | `fetchOpenOrders` | ✅ | ✅ | ✅ | Verified (Empty results pass for private data) |
| **Calculations** | `getExecutionPrice` | ✅ | ✅ | ✅ | |
| | `getExecutionPriceDetailed` | ✅ | ✅ | ✅ | |
| **Real-time** | `watchOrderBook` | ✅ | ✅ | ❌ | Limitless not supported |
| | `watchTrades` | ✅ | ✅ | ❌ | Limitless not supported |
| **Lifecycle** | `close` | ⚠️ | ⚠️ | ⚠️ | No compliance tests yet |

## Legend
- ✅ Compliance Verified (Strict Test Passed)
- ⚠️ No tests
- ❌ No Compliance Test

## Compliance Policy
- **Failure over Warning**: Tests must fail if no relevant data (markets, events, candles) is found. This ensures that we catch API breakages or unexpected empty responses.

## Tests with authentication
requires a dotenv in the root dir with
```
POLYMARKET_PRIVATE_KEY=0x...
# Kalshi
KALSHI_API_KEY=...
KALSHI_PRIVATE_KEY=... (RSA Private Key)
# Limitless
LIMITLESS_PRIVATE_KEY=0x...
```
