import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, OHLCVParams, TradesParams, ExchangeCredentials, EventFetchParams, MyTradesParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Balance, Order, Position, CreateOrderParams } from '../../types';
import { MyriadAuth } from './auth';
import { MyriadWebSocket } from './websocket';
import { myriadErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { BASE_URL } from './utils';
import { parseOpenApiSpec } from '../../utils/openapi';
import { myriadApiSpec } from './api';
import { MyriadFetcher } from './fetcher';
import { MyriadNormalizer } from './normalizer';
import { FetcherContext } from '../interfaces';

export class MyriadExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        fetchOHLCV: true as const,
        fetchOrderBook: 'emulated' as const,
        fetchTrades: true as const,
        createOrder: 'emulated' as const,
        cancelOrder: false as const,
        fetchOrder: false as const,
        fetchOpenOrders: 'emulated' as const,
        fetchPositions: true as const,
        fetchBalance: 'emulated' as const,
        watchAddress: false as const,
        unwatchAddress: false as const,
        watchOrderBook: 'emulated' as const,
        watchTrades: 'emulated' as const,
        fetchMyTrades: true as const,
        fetchClosedOrders: false as const,
        fetchAllOrders: false as const,
        buildOrder: false as const,
        submitOrder: false as const,
    };

    private auth?: MyriadAuth;
    private ws?: MyriadWebSocket;
    private readonly fetcher: MyriadFetcher;
    private readonly normalizer: MyriadNormalizer;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);
        this.rateLimit = 500;
        if (credentials?.apiKey) {
            this.auth = new MyriadAuth(credentials);
        }

        const descriptor = parseOpenApiSpec(myriadApiSpec, BASE_URL);
        this.defineImplicitApi(descriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => this.getHeaders(),
        };

        this.fetcher = new MyriadFetcher(ctx);
        this.normalizer = new MyriadNormalizer();
    }

    get name(): string {
        return 'Myriad';
    }

    private getHeaders(): Record<string, string> {
        if (this.auth) {
            return this.auth.getHeaders();
        }
        return { 'Content-Type': 'application/json' };
    }

    protected override sign(_method: string, _path: string, _params: Record<string, any>): Record<string, string> {
        return this.getHeaders();
    }

    protected override mapImplicitApiError(error: any): any {
        throw myriadErrorMapper.mapError(error);
    }

    private ensureAuth(): MyriadAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'This operation requires authentication. Initialize MyriadExchange with credentials (apiKey).',
                'Myriad'
            );
        }
        return this.auth;
    }

    // ------------------------------------------------------------------------
    // Market Data  (fetcher -> normalizer)
    // ------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        const rawMarkets = await this.fetcher.fetchRawMarkets(params);
        return rawMarkets
            .map((raw) => this.normalizer.normalizeMarket(raw))
            .filter((m): m is UnifiedMarket => m !== null);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        const rawQuestions = await this.fetcher.fetchRawEvents(params);
        return rawQuestions
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOHLCV(id: string, params: OHLCVParams): Promise<PriceCandle[]> {
        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter.');
        }
        const parts = id.split(':');
        const outcomeId = parts.length >= 3 ? parts[2] : undefined;

        const rawMarket = await this.fetcher.fetchRawOHLCV(id, params);
        return this.normalizer.normalizeOHLCV(rawMarket, params, outcomeId);
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        const rawMarket = await this.fetcher.fetchRawOrderBook(id);
        return this.normalizer.normalizeOrderBook(rawMarket, id);
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }

        const rawTrades = await this.fetcher.fetchRawTrades(id, params);
        return rawTrades.map((raw, i) => this.normalizer.normalizeTrade(raw, i));
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const walletAddress = this.ensureAuth().walletAddress;
        if (!walletAddress) {
            throw new AuthenticationError(
                'fetchMyTrades requires a wallet address. Pass privateKey as the wallet address in credentials.',
                'Myriad'
            );
        }

        const rawTrades = await this.fetcher.fetchRawMyTrades(params || {}, walletAddress);
        return rawTrades.map((raw, i) => this.normalizer.normalizeUserTrade(raw, i));
    }

    // ------------------------------------------------------------------------
    // Trading  (fetcher -> normalizer)
    // ------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const parts = params.marketId.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid marketId format: "${params.marketId}". Expected "{networkId}:{marketId}".`);
        }
        const [networkId, marketId] = parts;

        const outcomeParts = params.outcomeId.split(':');
        const outcomeId = outcomeParts.length >= 3 ? Number(outcomeParts[2]) : Number(outcomeParts[0]);

        const quoteBody: Record<string, any> = {
            market_id: Number(marketId),
            outcome_id: outcomeId,
            network_id: Number(networkId),
            action: params.side,
        };

        if (params.side === 'buy') {
            quoteBody.value = params.amount;
        } else {
            quoteBody.shares = params.amount;
        }

        if (params.price) {
            quoteBody.slippage = 0.01;
        }

        const quote = await this.callApi('postMarketsQuote', quoteBody);

        return {
            id: `myriad-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            marketId: params.marketId,
            outcomeId: params.outcomeId,
            side: params.side,
            type: 'market',
            price: quote.price_average,
            amount: params.side === 'buy' ? quote.value : quote.shares,
            status: 'pending',
            filled: 0,
            remaining: params.side === 'buy' ? quote.value : quote.shares,
            timestamp: Date.now(),
            fee: quote.fees ? (quote.fees.fee + quote.fees.treasury + quote.fees.distributor) : undefined,
        };
    }

    async cancelOrder(_orderId: string): Promise<Order> {
        throw new Error('cancelOrder() is not supported by Myriad (AMM-based exchange, no open orders)');
    }

    async fetchOrder(_orderId: string): Promise<Order> {
        throw new Error('fetchOrder() is not supported by Myriad (AMM-based exchange)');
    }

    async fetchOpenOrders(_marketId?: string): Promise<Order[]> {
        return []; // AMM: no open orders
    }

    async fetchPositions(): Promise<Position[]> {
        const walletAddress = this.ensureAuth().walletAddress;
        if (!walletAddress) {
            throw new AuthenticationError(
                'fetchPositions requires a wallet address. Pass privateKey as the wallet address in credentials.',
                'Myriad'
            );
        }

        const rawItems = await this.fetcher.fetchRawPositions(walletAddress);
        return rawItems.map((raw) => this.normalizer.normalizePosition(raw));
    }

    async fetchBalance(): Promise<Balance[]> {
        const walletAddress = this.ensureAuth().walletAddress;
        if (!walletAddress) {
            throw new AuthenticationError(
                'fetchBalance requires a wallet address. Pass privateKey as the wallet address in credentials.',
                'Myriad'
            );
        }

        const rawItems = await this.fetcher.fetchRawBalance(walletAddress);
        return this.normalizer.normalizeBalance(rawItems);
    }

    // ------------------------------------------------------------------------
    // WebSocket (poll-based)
    // ------------------------------------------------------------------------

    async watchOrderBook(id: string, _limit?: number): Promise<OrderBook> {
        this.ensureAuth();
        if (!this.ws) {
            this.ws = new MyriadWebSocket(
                this.callApi.bind(this),
                (id: string) => this.fetchOrderBook(id),
            );
        }
        return this.ws.watchOrderBook(id);
    }

    async watchTrades(id: string, address?: string, _since?: number, _limit?: number): Promise<Trade[]> {
        this.ensureAuth();
        if (!this.ws) {
            this.ws = new MyriadWebSocket(
                this.callApi.bind(this),
                (id: string) => this.fetchOrderBook(id),
            );
        }
        return this.ws.watchTrades(id);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}
