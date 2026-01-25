# DefaultApi

All URIs are relative to *http://localhost:3847*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelOrder**](DefaultApi.md#cancelorderoperation) | **POST** /api/{exchange}/cancelOrder | Cancel Order |
| [**createOrder**](DefaultApi.md#createorderoperation) | **POST** /api/{exchange}/createOrder | Create Order |
| [**fetchBalance**](DefaultApi.md#fetchbalance) | **POST** /api/{exchange}/fetchBalance | Fetch Balance |
| [**fetchMarkets**](DefaultApi.md#fetchmarketsoperation) | **POST** /api/{exchange}/fetchMarkets | Fetch Markets |
| [**fetchOHLCV**](DefaultApi.md#fetchohlcvoperation) | **POST** /api/{exchange}/fetchOHLCV | Fetch OHLCV Candles |
| [**fetchOpenOrders**](DefaultApi.md#fetchopenordersoperation) | **POST** /api/{exchange}/fetchOpenOrders | Fetch Open Orders |
| [**fetchOrder**](DefaultApi.md#fetchorder) | **POST** /api/{exchange}/fetchOrder | Fetch Order |
| [**fetchOrderBook**](DefaultApi.md#fetchorderbookoperation) | **POST** /api/{exchange}/fetchOrderBook | Fetch Order Book |
| [**fetchPositions**](DefaultApi.md#fetchpositionsoperation) | **POST** /api/{exchange}/fetchPositions | Fetch Positions |
| [**fetchTrades**](DefaultApi.md#fetchtradesoperation) | **POST** /api/{exchange}/fetchTrades | Fetch Trades |
| [**getMarketsBySlug**](DefaultApi.md#getmarketsbyslugoperation) | **POST** /api/{exchange}/getMarketsBySlug | Get Market by Slug |
| [**healthCheck**](DefaultApi.md#healthcheck) | **GET** /health | Server Health Check |
| [**searchMarkets**](DefaultApi.md#searchmarketsoperation) | **POST** /api/{exchange}/searchMarkets | Search Markets |
| [**watchOrderBook**](DefaultApi.md#watchorderbookoperation) | **POST** /api/{exchange}/watchOrderBook | Watch Order Book (WebSocket Stream) |
| [**watchTrades**](DefaultApi.md#watchtradesoperation) | **POST** /api/{exchange}/watchTrades | Watch Trades (WebSocket Stream) |



## cancelOrder

> CreateOrder200Response cancelOrder(exchange, cancelOrderRequest)

Cancel Order

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { CancelOrderOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // CancelOrderRequest (optional)
    cancelOrderRequest: ...,
  } satisfies CancelOrderOperationRequest;

  try {
    const data = await api.cancelOrder(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **cancelOrderRequest** | [CancelOrderRequest](CancelOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrder200Response**](CreateOrder200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Order cancelled |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createOrder

> CreateOrder200Response createOrder(exchange, createOrderRequest)

Create Order

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { CreateOrderOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // CreateOrderRequest (optional)
    createOrderRequest: ...,
  } satisfies CreateOrderOperationRequest;

  try {
    const data = await api.createOrder(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **createOrderRequest** | [CreateOrderRequest](CreateOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrder200Response**](CreateOrder200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Order created |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchBalance

> FetchBalance200Response fetchBalance(exchange, fetchPositionsRequest)

Fetch Balance

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchBalanceRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchPositionsRequest (optional)
    fetchPositionsRequest: ...,
  } satisfies FetchBalanceRequest;

  try {
    const data = await api.fetchBalance(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchPositionsRequest** | [FetchPositionsRequest](FetchPositionsRequest.md) |  | [Optional] |

### Return type

[**FetchBalance200Response**](FetchBalance200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Account balances |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchMarkets

> FetchMarkets200Response fetchMarkets(exchange, fetchMarketsRequest)

Fetch Markets

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchMarketsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchMarketsRequest (optional)
    fetchMarketsRequest: ...,
  } satisfies FetchMarketsOperationRequest;

  try {
    const data = await api.fetchMarkets(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchMarketsRequest** | [FetchMarketsRequest](FetchMarketsRequest.md) |  | [Optional] |

### Return type

[**FetchMarkets200Response**](FetchMarkets200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of unified markets |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOHLCV

> FetchOHLCV200Response fetchOHLCV(exchange, fetchOHLCVRequest)

Fetch OHLCV Candles

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOHLCVOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchOHLCVRequest (optional)
    fetchOHLCVRequest: ...,
  } satisfies FetchOHLCVOperationRequest;

  try {
    const data = await api.fetchOHLCV(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchOHLCVRequest** | [FetchOHLCVRequest](FetchOHLCVRequest.md) |  | [Optional] |

### Return type

[**FetchOHLCV200Response**](FetchOHLCV200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Historical prices |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOpenOrders

> FetchOpenOrders200Response fetchOpenOrders(exchange, fetchOpenOrdersRequest)

Fetch Open Orders

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOpenOrdersOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchOpenOrdersRequest (optional)
    fetchOpenOrdersRequest: ...,
  } satisfies FetchOpenOrdersOperationRequest;

  try {
    const data = await api.fetchOpenOrders(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchOpenOrdersRequest** | [FetchOpenOrdersRequest](FetchOpenOrdersRequest.md) |  | [Optional] |

### Return type

[**FetchOpenOrders200Response**](FetchOpenOrders200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of open orders |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOrder

> CreateOrder200Response fetchOrder(exchange, cancelOrderRequest)

Fetch Order

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOrderRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // CancelOrderRequest (optional)
    cancelOrderRequest: ...,
  } satisfies FetchOrderRequest;

  try {
    const data = await api.fetchOrder(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **cancelOrderRequest** | [CancelOrderRequest](CancelOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrder200Response**](CreateOrder200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Order details |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOrderBook

> FetchOrderBook200Response fetchOrderBook(exchange, fetchOrderBookRequest)

Fetch Order Book

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOrderBookOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchOrderBookRequest (optional)
    fetchOrderBookRequest: ...,
  } satisfies FetchOrderBookOperationRequest;

  try {
    const data = await api.fetchOrderBook(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchOrderBookRequest** | [FetchOrderBookRequest](FetchOrderBookRequest.md) |  | [Optional] |

### Return type

[**FetchOrderBook200Response**](FetchOrderBook200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Current order book |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchPositions

> FetchPositions200Response fetchPositions(exchange, fetchPositionsRequest)

Fetch Positions

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchPositionsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchPositionsRequest (optional)
    fetchPositionsRequest: ...,
  } satisfies FetchPositionsOperationRequest;

  try {
    const data = await api.fetchPositions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchPositionsRequest** | [FetchPositionsRequest](FetchPositionsRequest.md) |  | [Optional] |

### Return type

[**FetchPositions200Response**](FetchPositions200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | User positions |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchTrades

> FetchTrades200Response fetchTrades(exchange, fetchTradesRequest)

Fetch Trades

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchTradesOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchTradesRequest (optional)
    fetchTradesRequest: ...,
  } satisfies FetchTradesOperationRequest;

  try {
    const data = await api.fetchTrades(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **fetchTradesRequest** | [FetchTradesRequest](FetchTradesRequest.md) |  | [Optional] |

### Return type

[**FetchTrades200Response**](FetchTrades200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Recent trades |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getMarketsBySlug

> FetchMarkets200Response getMarketsBySlug(exchange, getMarketsBySlugRequest)

Get Market by Slug

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { GetMarketsBySlugOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // GetMarketsBySlugRequest (optional)
    getMarketsBySlugRequest: ...,
  } satisfies GetMarketsBySlugOperationRequest;

  try {
    const data = await api.getMarketsBySlug(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **getMarketsBySlugRequest** | [GetMarketsBySlugRequest](GetMarketsBySlugRequest.md) |  | [Optional] |

### Return type

[**FetchMarkets200Response**](FetchMarkets200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Targeted market |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## healthCheck

> HealthCheck200Response healthCheck()

Server Health Check

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { HealthCheckRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.healthCheck();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**HealthCheck200Response**](HealthCheck200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Server is consistent and running. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## searchMarkets

> FetchMarkets200Response searchMarkets(exchange, searchMarketsRequest)

Search Markets

Search for markets by title or description.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { SearchMarketsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // SearchMarketsRequest (optional)
    searchMarketsRequest: ...,
  } satisfies SearchMarketsOperationRequest;

  try {
    const data = await api.searchMarkets(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **searchMarketsRequest** | [SearchMarketsRequest](SearchMarketsRequest.md) |  | [Optional] |

### Return type

[**FetchMarkets200Response**](FetchMarkets200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Search results |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchOrderBook

> FetchOrderBook200Response watchOrderBook(exchange, watchOrderBookRequest)

Watch Order Book (WebSocket Stream)

Subscribe to real-time order book updates via WebSocket. Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern). 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchOrderBookOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchOrderBookRequest (optional)
    watchOrderBookRequest: ...,
  } satisfies WatchOrderBookOperationRequest;

  try {
    const data = await api.watchOrderBook(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **watchOrderBookRequest** | [WatchOrderBookRequest](WatchOrderBookRequest.md) |  | [Optional] |

### Return type

[**FetchOrderBook200Response**](FetchOrderBook200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Next order book update |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchTrades

> FetchTrades200Response watchTrades(exchange, watchTradesRequest)

Watch Trades (WebSocket Stream)

Subscribe to real-time trade updates via WebSocket. Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern). 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchTradesOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchTradesRequest (optional)
    watchTradesRequest: ...,
  } satisfies WatchTradesOperationRequest;

  try {
    const data = await api.watchTrades(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi] |
| **watchTradesRequest** | [WatchTradesRequest](WatchTradesRequest.md) |  | [Optional] |

### Return type

[**FetchTrades200Response**](FetchTrades200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Next trade update(s) |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

