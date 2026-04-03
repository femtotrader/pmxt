import {
    PredictionMarketExchange,
    MarketFetchParams,
    EventFetchParams,
    ExchangeCredentials,
} from "../../BaseExchange";
import { UnifiedMarket, UnifiedEvent } from "../../types";
import { parseOpenApiSpec } from "../../utils/openapi";
import { metaculusApiSpec } from "./api";
import { metaculusErrorMapper } from "./errors";
import { BASE_URL } from "./utils";
import { fetchMarkets } from "./fetchMarkets";
import { fetchEvents } from "./fetchEvents";

/**
 * Read-only Metaculus integration (community forecasts, no CLOB).
 * The live API returns 403 for unauthenticated requests; pass `{ apiToken }`
 * from your Metaculus account (header `Authorization: Token …`).
 */
export class MetaculusExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        // Metaculus is a read-only forecasting platform — no order book, no trading
        fetchOHLCV: false as const,
        fetchOrderBook: false as const,
        fetchTrades: false as const,
        createOrder: false as const,
        cancelOrder: false as const,
        fetchOrder: false as const,
        fetchOpenOrders: false as const,
        fetchPositions: false as const,
        fetchBalance: false as const,
        watchAddress: false as const,
        unwatchAddress: false as const,
        watchOrderBook: false as const,
        watchTrades: false as const,
        fetchMyTrades: false as const,
        fetchClosedOrders: false as const,
        fetchAllOrders: false as const,
        buildOrder: false as const,
        submitOrder: false as const,
    };

    private readonly apiToken?: string;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);

        this.apiToken = credentials?.apiToken;

        // Rate-limit conservatively; authenticated users get higher Metaculus quotas
        this.rateLimit = 500;

        const descriptor = parseOpenApiSpec(metaculusApiSpec, BASE_URL);
        this.defineImplicitApi(descriptor);
    }

    get name(): string {
        return "Metaculus";
    }

    protected override mapImplicitApiError(error: any): any {
        throw metaculusErrorMapper.mapError(error);
    }

    /**
     * Sign requests with an API token when one is provided.
     * Metaculus uses token-based auth: `Authorization: Token <token>`.
     * Without a token the API still works for read-only endpoints (rate-limited).
     */
    protected override sign(
        _method: string,
        _path: string,
        _params: Record<string, any>,
    ): Record<string, string> {
        if (this.apiToken) {
            return { Authorization: `Token ${this.apiToken}` };
        }
        return {};
    }

    // -------------------------------------------------------------------------
    // Market Data
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFetchParams,
    ): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.callApi.bind(this));
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        return fetchEvents(params, this.callApi.bind(this));
    }
}
