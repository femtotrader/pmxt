# Feature Support & Compliance

This document details the feature support and compliance status for each exchange. PMXT enforces a strict compliance standard to ensure protocol consistency across all implementations.

## Functions Status

| Category | Function | Polymarket | Kalshi | Limitless | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Identity** | `name` | ✅ | ✅ | ✅ | |
| **Market Data** | `fetchMarkets` | ✅ | ✅ | ✅ | |
| | `searchMarkets` | ✅ | ✅ | ✅ | |
| | `getMarketsBySlug` | ✅ | ✅ | ✅ | |
| | `searchEvents` | ✅ | ✅ | ✅ | |
| **Public Data** | `fetchOHLCV` | ✅ | ✅ | ✅ | |
| | `fetchOrderBook` | ✅ | ✅ | ✅ | |
| | `fetchTrades` | ✅ | ✅ | ❌ | Limitless: No public trades API/Fails on live markets |
| **Private Data** | `fetchBalance` | ✅ | ✅ | ✅ | Verified (Real API calls, balances fetched) |
| | `fetchPositions` | ✅ | ✅ | ✅ | |
| **Trading** | `createOrder` | ✅ | ✅ | ✅ | All Exchange verified (Mock/Rejected due to funds) |
| | `cancelOrder` | ✅ | ✅ | ✅ | Verified (Interface correct, returns Not Found for dummy IDs) |
| | `fetchOrder` | ❌ | ❌ | ❌ | All failing. Poly: TypeError, Kalshi: 400, Limitless: Slug required |
| | `fetchOpenOrders` | ✅ | ✅ | ✅ | Verified (Empty results pass for private data) |
| **Calculations** | `getExecutionPrice` | ✅ | ✅ | ✅ | |
| | `getExecutionPriceDetailed` | ✅ | ✅ | ✅ | |
| **Real-time** | `watchOrderBook` | ✅ | ✅ | ⚠️ | Limitless: No websocket support |
| | `watchTrades` | ✅ | ✅ | ⚠️ | Limitless: No websocket support |

## Legend
- ✅ Compliance Verified (Strict Test Passed)
- ❌ Compliance Failure (Test Failed or Feature Broken)
- ⚠️ Partial Support / Skipped (e.g., Missing API/Websocket)

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
