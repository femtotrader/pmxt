import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, OHLCVParams, TradesParams, ExchangeCredentials, EventFetchParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, Balance, Order, Position, CreateOrderParams } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents } from './fetchEvents';
import { fetchOHLCV } from './fetchOHLCV';
import { KalshiAuth } from './auth';
import { validateIdFormat } from '../../utils/validation';
import { KalshiWebSocket, KalshiWebSocketConfig } from './websocket';
import { kalshiErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { parseOpenApiSpec } from '../../utils/openapi';
import { kalshiApiSpec } from './api';

// Re-export for external use
export type { KalshiWebSocketConfig };

export interface KalshiExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: KalshiWebSocketConfig;
}

export class KalshiExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        fetchOHLCV: true as const,
        fetchOrderBook: true as const,
        fetchTrades: true as const,
        createOrder: true as const,
        cancelOrder: true as const,
        fetchOrder: true as const,
        fetchOpenOrders: true as const,
        fetchPositions: true as const,
        fetchBalance: true as const,
        watchOrderBook: true as const,
        watchTrades: true as const,
    };

    private auth?: KalshiAuth;
    private wsConfig?: KalshiWebSocketConfig;

    constructor(options?: ExchangeCredentials | KalshiExchangeOptions) {
        // Support both old signature (credentials only) and new signature (options object)
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: KalshiWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            // New signature: KalshiExchangeOptions
            credentials = options.credentials;
            wsConfig = options.websocket;
        } else {
            // Old signature: ExchangeCredentials directly
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.wsConfig = wsConfig;

        if (credentials?.apiKey && credentials?.privateKey) {
            this.auth = new KalshiAuth(credentials);
        }

        const descriptor = parseOpenApiSpec(kalshiApiSpec);
        this.defineImplicitApi(descriptor);
    }

    get name(): string {
        return "Kalshi";
    }

    // ----------------------------------------------------------------------------
    // Implicit API Auth & Error Mapping
    // ----------------------------------------------------------------------------

    protected override sign(method: string, path: string, _params: Record<string, any>): Record<string, string> {
        const auth = this.ensureAuth();
        // The implicit API passes just the spec path (e.g. /portfolio/balance),
        // but Kalshi's signature requires the full path including /trade-api/v2.
        return auth.getHeaders(method, '/trade-api/v2' + path);
    }

    protected override mapImplicitApiError(error: any): any {
        throw kalshiErrorMapper.mapError(error);
    }

    // ----------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------

    private ensureAuth(): KalshiAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize KalshiExchange with credentials (apiKey and privateKey).',
                'Kalshi'
            );
        }
        return this.auth;
    }

    // ----------------------------------------------------------------------------
    // Market Data Methods - Implementation for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.callApi.bind(this));
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return fetchEvents(params, this.callApi.bind(this));
    }

    async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]> {
        return fetchOHLCV(id, params, this.callApi.bind(this));
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        validateIdFormat(id, 'OrderBook');

        const isNoOutcome = id.endsWith('-NO');
        const ticker = id.replace(/-NO$/, '');
        const data = (await this.callApi('GetMarketOrderbook', { ticker })).orderbook;

        let bids: any[];
        let asks: any[];

        if (isNoOutcome) {
            bids = (data.no || []).map((level: number[]) => ({
                price: level[0] / 100,
                size: level[1],
            }));
            asks = (data.yes || []).map((level: number[]) => ({
                price: 1 - (level[0] / 100),
                size: level[1],
            }));
        } else {
            bids = (data.yes || []).map((level: number[]) => ({
                price: level[0] / 100,
                size: level[1],
            }));
            asks = (data.no || []).map((level: number[]) => ({
                price: 1 - (level[0] / 100),
                size: level[1],
            }));
        }

        bids.sort((a: any, b: any) => b.price - a.price);
        asks.sort((a: any, b: any) => a.price - b.price);

        return { bids, asks, timestamp: Date.now() };
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }
        const ticker = id.replace(/-NO$/, '');
        const data = await this.callApi('GetTrades', { ticker, limit: params.limit || 100 });
        const trades = data.trades || [];
        return trades.map((t: any) => ({
            id: t.trade_id,
            timestamp: new Date(t.created_time).getTime(),
            price: t.yes_price / 100,
            amount: t.count,
            side: t.taker_side === 'yes' ? 'buy' : 'sell',
        }));
    }

    // ----------------------------------------------------------------------------
    // User Data Methods
    // ----------------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        const data = await this.callApi('GetBalance');
        const available = data.balance / 100;
        const total = data.portfolio_value / 100;
        return [{
            currency: 'USD',
            total,
            available,
            locked: total - available,
        }];
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const isYesSide = params.side === 'buy';
        const kalshiOrder: Record<string, any> = {
            ticker: params.marketId,
            client_order_id: `pmxt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            side: isYesSide ? 'yes' : 'no',
            action: params.side === 'buy' ? 'buy' : 'sell',
            count: params.amount,
            type: params.type === 'limit' ? 'limit' : 'market',
        };

        if (params.price) {
            const priceInCents = Math.round(params.price * 100);
            if (isYesSide) {
                kalshiOrder.yes_price = priceInCents;
            } else {
                kalshiOrder.no_price = priceInCents;
            }
        }

        const data = await this.callApi('CreateOrder', kalshiOrder);
        const order = data.order;

        return {
            id: order.order_id,
            marketId: params.marketId,
            outcomeId: params.outcomeId,
            side: params.side,
            type: params.type,
            price: params.price,
            amount: params.amount,
            status: this.mapKalshiOrderStatus(order.status),
            filled: order.queue_position === 0 ? params.amount : 0,
            remaining: order.remaining_count || params.amount,
            timestamp: new Date(order.created_time).getTime(),
        };
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const data = await this.callApi('CancelOrder', { order_id: orderId });
        const order = data.order;

        return {
            id: order.order_id,
            marketId: order.ticker,
            outcomeId: order.ticker,
            side: order.side === 'yes' ? 'buy' : 'sell',
            type: 'limit',
            amount: order.count,
            status: 'cancelled',
            filled: order.count - (order.remaining_count || 0),
            remaining: 0,
            timestamp: new Date(order.created_time).getTime(),
        };
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const data = await this.callApi('GetOrder', { order_id: orderId });
        const order = data.order;

        return {
            id: order.order_id,
            marketId: order.ticker,
            outcomeId: order.ticker,
            side: order.side === 'yes' ? 'buy' : 'sell',
            type: order.type === 'limit' ? 'limit' : 'market',
            price: order.yes_price ? order.yes_price / 100 : undefined,
            amount: order.count,
            status: this.mapKalshiOrderStatus(order.status),
            filled: order.count - (order.remaining_count || 0),
            remaining: order.remaining_count || 0,
            timestamp: new Date(order.created_time).getTime(),
        };
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const queryParams: Record<string, any> = { status: 'resting' };
        if (marketId) {
            queryParams.ticker = marketId;
        }

        const data = await this.callApi('GetOrders', queryParams);
        const orders = data.orders || [];

        return orders.map((order: any) => ({
            id: order.order_id,
            marketId: order.ticker,
            outcomeId: order.ticker,
            side: order.side === 'yes' ? 'buy' : 'sell',
            type: order.type === 'limit' ? 'limit' : 'market',
            price: order.yes_price ? order.yes_price / 100 : undefined,
            amount: order.count,
            status: 'open' as const,
            filled: order.count - (order.remaining_count || 0),
            remaining: order.remaining_count || 0,
            timestamp: new Date(order.created_time).getTime(),
        }));
    }

    async fetchPositions(): Promise<Position[]> {
        const data = await this.callApi('GetPositions');
        const positions = data.market_positions || [];

        return positions.map((pos: any) => {
            const absPosition = Math.abs(pos.position);
            const entryPrice = absPosition > 0 ? pos.total_cost / absPosition / 100 : 0;

            return {
                marketId: pos.ticker,
                outcomeId: pos.ticker,
                outcomeLabel: pos.ticker,
                size: pos.position,
                entryPrice,
                currentPrice: pos.market_price ? pos.market_price / 100 : entryPrice,
                unrealizedPnL: pos.market_exposure ? pos.market_exposure / 100 : 0,
                realizedPnL: pos.realized_pnl ? pos.realized_pnl / 100 : 0,
            };
        });
    }

    // Helper to map Kalshi order status to unified status
    private mapKalshiOrderStatus(status: string): 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' {
        switch (status.toLowerCase()) {
            case 'resting':
                return 'open';
            case 'canceled':
            case 'cancelled':
                return 'cancelled';
            case 'executed':
            case 'filled':
                return 'filled';
            default:
                return 'open';
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: KalshiWebSocket;

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        const auth = this.ensureAuth();

        if (!this.ws) {
            this.ws = new KalshiWebSocket(auth, this.wsConfig);
        }
        // Normalize ticker (strip -NO suffix if present)
        const marketTicker = id.replace(/-NO$/, '');
        return this.ws.watchOrderBook(marketTicker);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        const auth = this.ensureAuth();

        if (!this.ws) {
            this.ws = new KalshiWebSocket(auth, this.wsConfig);
        }
        // Normalize ticker (strip -NO suffix if present)
        const marketTicker = id.replace(/-NO$/, '');
        return this.ws.watchTrades(marketTicker);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}
