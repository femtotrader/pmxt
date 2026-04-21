/**
 * Exchange client implementations.
 * 
 * This module provides clean, TypeScript-friendly wrappers around the auto-generated
 * OpenAPI client, matching the Python API exactly.
 */

import {
    Configuration,
    CreateOrderRequest,
    DefaultApi,
    ExchangeCredentials,
    BuildOrderRequest,
    SubmitOrderRequest,
} from "../generated/src/index.js";

import {
    Balance,
    BuiltOrder,
    CreateOrderParams,
    EventFilterCriteria,
    EventFilterFunction,
    ExecutionPriceResult,
    MarketFilterCriteria,
    MarketFilterFunction,
    MarketList,
    MarketOutcome,
    Order,
    OrderBook,
    OrderLevel,
    PaginatedMarketsResult,
    Position,
    PriceCandle,
    SubscribedAddressSnapshot,
    SubscriptionOption,
    Trade,
    UnifiedEvent,
    UnifiedMarket,
    UserTrade,
} from "./models.js";

import { ServerManager } from "./server-manager.js";
import { buildArgsWithOptionalOptions } from "./args.js";
import { PmxtError, fromServerError } from "./errors.js";
import { LOCAL_URL, resolvePmxtBaseUrl } from "./constants.js";

/**
 * Resolve a MarketOutcome shorthand to a plain outcome ID string.
 * Accepts either a raw string ID or a MarketOutcome object.
 */
function resolveOutcomeId(input: string | MarketOutcome): string {
    if (typeof input === 'string') return input;
    return input.outcomeId;
}

/**
 * Build a URL-encoded query string from a plain record.
 *
 * - `undefined` / `null` values are skipped (they shouldn't appear in the URL).
 * - Arrays are serialised as repeated `key=v1&key=v2` pairs.
 * - Nested objects are skipped here; callers should route such queries through
 *   POST instead (see `queryHasNestedObject`).
 */
function buildSidecarQueryString(query: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            for (const v of value) {
                if (v === undefined || v === null) continue;
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
            }
        } else if (typeof value === 'object') {
            // Nested objects don't round-trip through query strings. Caller
            // should have detected this and POSTed instead.
            continue;
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
    }
    return parts.join('&');
}

/**
 * True if any top-level value in the query is a nested object (not an array).
 * Such queries can't be safely expressed in a query string, so we fall back
 * to POST to preserve the original argument shape.
 */
function queryHasNestedObject(query: Record<string, unknown>): boolean {
    for (const value of Object.values(query)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object' && !Array.isArray(value)) return true;
    }
    return false;
}

// Converter functions
function convertMarket(raw: any): UnifiedMarket {
    const outcomes: MarketOutcome[] = (raw.outcomes || []).map((o: any) => ({
        outcomeId: o.outcomeId,
        marketId: o.marketId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }));

    const convertOutcome = (o: any) => o ? ({
        outcomeId: o.outcomeId,
        marketId: o.marketId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }) : undefined;

    return {
        marketId: raw.marketId,
        title: raw.title,
        slug: raw.slug,
        outcomes,
        volume24h: raw.volume24h || 0,
        liquidity: raw.liquidity || 0,
        url: raw.url,
        description: raw.description,
        resolutionDate: raw.resolutionDate ? new Date(raw.resolutionDate) : undefined,
        volume: raw.volume,
        openInterest: raw.openInterest,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
        tickSize: raw.tickSize,
        status: raw.status,
        contractAddress: raw.contractAddress,
        eventId: raw.eventId,
        yes: convertOutcome(raw.yes),
        no: convertOutcome(raw.no),
        up: convertOutcome(raw.up),
        down: convertOutcome(raw.down),
    };
}


function convertCandle(raw: any): PriceCandle {
    return {
        timestamp: raw.timestamp,
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: raw.volume,
    };
}

function convertOrderBook(raw: any): OrderBook {
    const bids: OrderLevel[] = (raw.bids || []).map((b: any) => ({
        price: b.price,
        size: b.size,
    }));

    const asks: OrderLevel[] = (raw.asks || []).map((a: any) => ({
        price: a.price,
        size: a.size,
    }));

    return {
        bids,
        asks,
        timestamp: raw.timestamp,
    };
}

function convertTrade(raw: any): Trade {
    return {
        id: raw.id,
        timestamp: raw.timestamp,
        price: raw.price,
        amount: raw.amount,
        side: raw.side || "unknown",
    };
}

function convertOrder(raw: any): Order {
    return {
        id: raw.id,
        marketId: raw.marketId,
        outcomeId: raw.outcomeId,
        side: raw.side,
        type: raw.type,
        amount: raw.amount,
        status: raw.status,
        filled: raw.filled,
        remaining: raw.remaining,
        timestamp: raw.timestamp,
        price: raw.price,
        fee: raw.fee,
    };
}

function convertPosition(raw: any): Position {
    return {
        marketId: raw.marketId,
        outcomeId: raw.outcomeId,
        outcomeLabel: raw.outcomeLabel,
        size: raw.size,
        entryPrice: raw.entryPrice,
        currentPrice: raw.currentPrice,
        unrealizedPnL: raw.unrealizedPnL,
        realizedPnL: raw.realizedPnL,
    };
}

function convertBalance(raw: any): Balance {
    return {
        currency: raw.currency,
        total: raw.total,
        available: raw.available,
        locked: raw.locked,
    };
}

function convertUserTrade(raw: any): UserTrade {
    return {
        id: raw.id,
        price: raw.price,
        amount: raw.amount,
        side: raw.side || "unknown",
        timestamp: raw.timestamp,
        orderId: raw.orderId,
        outcomeId: raw.outcomeId,
        marketId: raw.marketId,
    };
}

function convertEvent(raw: any): UnifiedEvent {
    const markets = MarketList.from((raw.markets || []).map(convertMarket)) as MarketList;

    const event: UnifiedEvent = {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        slug: raw.slug,
        markets,
        volume24h: raw.volume24h,
        volume: raw.volume,
        url: raw.url,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
    };

    return event;
}


function convertSubscriptionSnapshot(raw: any): SubscribedAddressSnapshot {
    const trades = (raw.trades?? []).map(convertTrade);
    const balances = (raw.balances?? []).map(convertBalance);
    const positions = (raw.positions?? []).map(convertPosition);

    const snapShot: SubscribedAddressSnapshot = {
      address: raw.address,
      trades,
      balances,
      positions,
      timestamp: raw.timestamp,
    };
    return snapShot;
}

/**
 * Base exchange client options.
 */
export interface ExchangeOptions {
    /** Venue-specific API key (e.g. Polymarket CLOB key). Optional. */
    apiKey?: string;

    /** Venue-specific private key. Optional. */
    privateKey?: string;

    /**
     * Hosted pmxt API key.
     *
     * When set (either as this kwarg or via the `PMXT_API_KEY` env
     * variable), and no explicit `baseUrl` / `PMXT_BASE_URL` is set,
     * the Exchange will default to the hosted pmxt endpoint
     * (`https://api.pmxt.dev`) instead of the local sidecar, and send
     * `Authorization: Bearer <pmxtApiKey>` on every request.
     *
     * The local sidecar ignores this header, so it is safe to set in
     * both local and hosted modes.
     */
    pmxtApiKey?: string;

    /**
     * Base URL of the pmxt server.
     *
     * Resolution precedence:
     *   1. Explicit `baseUrl` kwarg.
     *   2. `PMXT_BASE_URL` environment variable.
     *   3. `HOSTED_URL` when `pmxtApiKey` (kwarg or env) is present.
     *   4. Local sidecar (`http://localhost:3847`).
     */
    baseUrl?: string;

    /**
     * Automatically start the local sidecar if it is not running.
     *
     * Default: `true` when the resolved base URL is the local sidecar,
     * `false` otherwise. Explicit `true` / `false` always wins.
     */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type (0=EOA, 1=Proxy) */
    signatureType?: number;
}

/**
 * Base class for prediction market exchanges.
 * 
 * This provides a unified interface for interacting with different
 * prediction market platforms (Polymarket, Kalshi, etc.).
 */
export abstract class Exchange {
    protected exchangeName: string;
    protected apiKey?: string;
    protected privateKey?: string;
    protected pmxtApiKey?: string;
    protected proxyAddress?: string;
    protected signatureType?: number;
    protected api: DefaultApi;
    protected config: Configuration;
    protected serverManager: ServerManager;
    protected initPromise: Promise<void>;
    protected isHosted: boolean;

    /**
     * Sticky flag: set to `true` the first time a GET read is rejected by
     * the sidecar with 404/405 (i.e. an older pmxt-core that only supports
     * POST). While false, read methods try GET first; once flipped they
     * POST directly and skip the GET probe for the lifetime of this client.
     */
    private _getReadsUnsupported: boolean = false;

    constructor(exchangeName: string, options: ExchangeOptions = {}) {
        this.exchangeName = exchangeName.toLowerCase();
        this.apiKey = options.apiKey;
        this.privateKey = options.privateKey;
        this.proxyAddress = options.proxyAddress;
        this.signatureType = options.signatureType;

        // Resolve base URL + hosted API key via the shared precedence
        // rules. See constants.ts for the full resolution table.
        const resolved = resolvePmxtBaseUrl({
            baseUrl: options.baseUrl,
            pmxtApiKey: options.pmxtApiKey,
        });
        const baseUrl = resolved.baseUrl;
        this.pmxtApiKey = resolved.pmxtApiKey;
        this.isHosted = resolved.isHosted;

        // auto_start_server defaults: true for local, false for hosted.
        // An explicit value in the options always wins.
        const autoStartServer = options.autoStartServer !== undefined
            ? options.autoStartServer
            : !this.isHosted;

        // Initialize server manager (no network calls happen here — the
        // constructor just stores config).
        this.serverManager = new ServerManager({ baseUrl });

        // Configure the API client with the initial base URL (will be
        // updated to the actual listen port if the local sidecar gets
        // bumped off the default).
        this.config = new Configuration({ basePath: baseUrl });
        this.api = new DefaultApi(this.config);

        // Initialize the server connection asynchronously
        this.initPromise = this.initializeServer(autoStartServer);
    }

    private async initializeServer(autoStartServer: boolean): Promise<void> {
        if (autoStartServer) {
            try {
                await this.serverManager.ensureServerRunning();

                // Get the actual port the server is running on
                // (may differ from default if default port was busy)
                const actualPort = this.serverManager.getRunningPort();
                const newBaseUrl = `http://localhost:${actualPort}`;

                // Update API client with actual base URL
                this.config = new Configuration({
                    basePath: newBaseUrl,
                });
                this.api = new DefaultApi(this.config);
            } catch (error) {
                throw new PmxtError(
                    `Failed to start PMXT server: ${error}\n\n` +
                    `Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n` +
                    `Or start the server manually: pmxt-server`
                );
            }
        }
    }

    protected handleResponse(response: any): any {
        if (!response.success) {
            const error = response.error || {};
            if (error && typeof error === "object" && (error.code || error.message)) {
                throw fromServerError(error);
            }
            throw new PmxtError(error.message || "Unknown error");
        }
        return response.data;
    }

    protected getCredentials(): ExchangeCredentials | undefined {
        if (!this.apiKey && !this.privateKey) {
            return undefined;
        }
        return {
            apiKey: this.apiKey,
            privateKey: this.privateKey,
            funderAddress: this.proxyAddress,
            signatureType: this.signatureType,
        };
    }

    protected getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = { ...(this.config.headers as Record<string, string>) };

        // Local sidecar access token (read from the lock file). Only
        // meaningful when talking to a local sidecar we spawned
        // ourselves; harmless elsewhere.
        const accessToken = this.serverManager.getAccessToken();
        if (accessToken) {
            headers['x-pmxt-access-token'] = accessToken;
        }

        // Hosted pmxt bearer token. The hosted service requires this;
        // the local sidecar ignores it. Safe to attach unconditionally
        // whenever a pmxtApiKey has been resolved.
        if (this.pmxtApiKey) {
            headers['Authorization'] = `Bearer ${this.pmxtApiKey}`;
        }

        return headers;
    }

    // Low-Level API Access

    /**
     * Call an exchange-specific REST endpoint by its operationId.
     * This provides direct access to all implicit API methods defined in
     * the exchange's OpenAPI spec (e.g., Polymarket CLOB, Kalshi trading API).
     *
     * @param operationId - The operationId (or auto-generated name) of the endpoint
     * @param params - Optional parameters to pass to the endpoint
     * @returns The raw response data from the exchange
     *
     * @example
     * ```typescript
     * // Call a Polymarket CLOB endpoint directly
     * const result = await poly.callApi('getMarket', { condition_id: '0x...' });
     * ```
     */
    async callApi(operationId: string, params?: Record<string, any>): Promise<any> {
        await this.initPromise;
        try {
            const url = `${this.config.basePath}/api/${this.exchangeName}/callApi`;

            const requestBody: any = {
                args: [operationId, params],
                credentials: this.getCredentials()
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to call API '${operationId}': ${error}`);
        }
    }

    /**
     * Dispatch a sidecar read method, preferring GET but transparently
     * falling back to POST for full backward compatibility.
     *
     * GET is used when:
     *   - the client has no per-instance credentials (the sidecar's GET
     *     handler intentionally drops credentials to avoid leaking them
     *     through query strings and access logs), and
     *   - the sidecar hasn't already returned 404/405 for a previous GET
     *     in this client's lifetime (`_getReadsUnsupported`), and
     *   - the query has no nested objects (query strings can't round-trip
     *     arbitrary JSON).
     *
     * Otherwise (or if the GET attempt is rejected with 404/405) the call
     * is sent as POST with the original `{args, credentials}` body so that
     * SDK users talking to an older pmxt-core continue to work unchanged.
     *
     * @internal — shared transport used by every generated read method.
     */
    protected async sidecarReadRequest(
        methodName: string,
        query: Record<string, unknown>,
        args: unknown[],
    ): Promise<any> {
        const baseUrl = `${this.config.basePath}/api/${this.exchangeName}/${methodName}`;
        const hasCredentials = this.getCredentials() !== undefined;

        if (!hasCredentials && !this._getReadsUnsupported && !queryHasNestedObject(query)) {
            const qs = buildSidecarQueryString(query);
            const getUrl = qs ? `${baseUrl}?${qs}` : baseUrl;
            const response = await fetch(getUrl, {
                method: 'GET',
                headers: this.getAuthHeaders(),
            });

            // 404 / 405 => older sidecar without GET dispatch. Remember
            // the downgrade so future calls skip the probe, and fall
            // through to POST below.
            if (response.status === 404 || response.status === 405) {
                await response.text().catch(() => undefined);
                this._getReadsUnsupported = true;
            } else {
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    if (body.error && typeof body.error === "object") {
                        throw fromServerError(body.error);
                    }
                    throw new PmxtError(body.error?.message || response.statusText);
                }
                return response.json();
            }
        }

        // POST fallback — identical to the original per-method template.
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ args, credentials: this.getCredentials() }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            if (body.error && typeof body.error === "object") {
                throw fromServerError(body.error);
            }
            throw new PmxtError(body.error?.message || response.statusText);
        }
        return response.json();
    }

    // BEGIN GENERATED METHODS

    async loadMarkets(reload: boolean = false): Promise<Record<string, UnifiedMarket>> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(reload);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/loadMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            const result: Record<string, UnifiedMarket> = {};
            for (const [key, value] of Object.entries(data as any)) {
                result[key] = convertMarket(value);
            }
            return result;
        } catch (error) {
            throw new Error(`Failed to loadMarkets: ${error}`);
        }
    }

    async fetchMarkets(params?: any): Promise<UnifiedMarket[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertMarket);
        } catch (error) {
            throw new Error(`Failed to fetchMarkets: ${error}`);
        }
    }

    async fetchMarketsPaginated(params?: any): Promise<PaginatedMarketsResult> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMarketsPaginated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return {
                data: (data.data || []).map(convertMarket),
                total: data.total,
                nextCursor: data.nextCursor,
            };
        } catch (error) {
            throw new Error(`Failed to fetchMarketsPaginated: ${error}`);
        }
    }

    async fetchEvents(params?: any): Promise<UnifiedEvent[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchEvents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertEvent);
        } catch (error) {
            throw new Error(`Failed to fetchEvents: ${error}`);
        }
    }

    async fetchMarket(params?: any): Promise<UnifiedMarket> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMarket`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertMarket(data);
        } catch (error) {
            throw new Error(`Failed to fetchMarket: ${error}`);
        }
    }

    async fetchEvent(params?: any): Promise<UnifiedEvent> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchEvent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertEvent(data);
        } catch (error) {
            throw new Error(`Failed to fetchEvent: ${error}`);
        }
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(id);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrderBook(data);
        } catch (error) {
            throw new Error(`Failed to fetchOrderBook: ${error}`);
        }
    }

    async submitOrder(built: any): Promise<Order> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(built);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/submitOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to submitOrder: ${error}`);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(orderId);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/cancelOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to cancelOrder: ${error}`);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(orderId);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to fetchOrder: ${error}`);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (marketId !== undefined) args.push(marketId);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchOpenOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetchOpenOrders: ${error}`);
        }
    }

    async fetchMyTrades(params?: any): Promise<UserTrade[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMyTrades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertUserTrade);
        } catch (error) {
            throw new Error(`Failed to fetchMyTrades: ${error}`);
        }
    }

    async fetchClosedOrders(params?: any): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchClosedOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetchClosedOrders: ${error}`);
        }
    }

    async fetchAllOrders(params?: any): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchAllOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetchAllOrders: ${error}`);
        }
    }

    async fetchPositions(address?: string): Promise<Position[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (address !== undefined) args.push(address);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchPositions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertPosition);
        } catch (error) {
            throw new Error(`Failed to fetchPositions: ${error}`);
        }
    }

    async fetchBalance(address?: string): Promise<Balance[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (address !== undefined) args.push(address);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchBalance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertBalance);
        } catch (error) {
            throw new Error(`Failed to fetchBalance: ${error}`);
        }
    }

    async unwatchOrderBook(id: string): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(id);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/unwatchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to unwatchOrderBook: ${error}`);
        }
    }

    async unwatchAddress(address: string): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(address);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/unwatchAddress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to unwatchAddress: ${error}`);
        }
    }

    async close(): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to close: ${error}`);
        }
    }

    // END GENERATED METHODS

    /**
     * Get historical price candles.
     *
     * @param outcomeId - Outcome ID (from market.outcomes[].outcomeId)
     * @param params - History filter parameters
     * @returns List of price candles
     * 
     * @example
     * ```typescript
     * const markets = await exchange.fetchMarkets({ query: "Trump" });
     * const outcomeId = markets[0].outcomes[0].outcomeId;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: "1h",
     *   limit: 100
     * });
     * ```
     */
    async fetchOHLCV(
        outcomeId: string | MarketOutcome,
        params: any
    ): Promise<PriceCandle[]> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.start) {
                paramsDict.start = params.start.toISOString();
            }
            if (params.end) {
                paramsDict.end = params.end.toISOString();
            }
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const args = [resolvedOutcomeId, paramsDict];
            const query = { id: resolvedOutcomeId, ...paramsDict };
            const json = await this.sidecarReadRequest('fetchOHLCV', query, args);
            const data = this.handleResponse(json);
            return data.map(convertCandle);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetch OHLCV: ${error}`);
        }
    }

    /**
     * Get trade history for an outcome.
     *
     * Note: Polymarket requires API key.
     *
     * @param outcomeId - Outcome ID
     * @param params - History filter parameters
     * @returns List of trades
     */
    async fetchTrades(
        outcomeId: string | MarketOutcome,
        params: any
    ): Promise<Trade[]> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const args = [resolvedOutcomeId, paramsDict];
            const query = { id: resolvedOutcomeId, ...paramsDict };
            const json = await this.sidecarReadRequest('fetchTrades', query, args);
            const data = this.handleResponse(json);
            return data.map(convertTrade);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetch trades: ${error}`);
        }
    }

    // WebSocket Streaming Methods

    /**
     * Watch real-time order book updates via WebSocket.
     * 
     * Returns a promise that resolves with the next order book update.
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * 
     * @param outcomeId - Outcome ID to watch
     * @param limit - Optional depth limit for order book
     * @returns Next order book update
     * 
     * @example
     * ```typescript
     * // Stream order book updates
     * while (true) {
     *   const orderBook = await exchange.watchOrderBook(outcomeId);
     *   console.log(`Best bid: ${orderBook.bids[0].price}`);
     *   console.log(`Best ask: ${orderBook.asks[0].price}`);
     * }
     * ```
     */
    async watchOrderBook(outcomeId: string | MarketOutcome, limit?: number): Promise<OrderBook> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const args: any[] = [resolvedOutcomeId];
            if (limit !== undefined) {
                args.push(limit);
            }

            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/watchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrderBook(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch order book: ${error}`);
        }
    }

    /**
     * Unsubscribe from a previously watched order book stream.
     *
     * @param outcomeId - Outcome ID to stop watching
     */
    async unwatchOrderBook(outcomeId: string | MarketOutcome): Promise<void> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const args: any[] = [resolvedOutcomeId];

            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/unwatchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to unwatch order book: ${error}`);
        }
    }

    /**
     * Watch real-time trade updates via WebSocket.
     * 
     * Returns a promise that resolves with the next trade(s).
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * 
     * @param outcomeId - Outcome ID to watch
     * @param address - Public wallet to be watched
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Next trade update(s)
     * 
     * @example
     * ```typescript
     * // Stream trade updates
     * while (true) {
     *   const trades = await exchange.watchTrades(outcomeId);
     *   for (const trade of trades) {
     *     console.log(`Trade: ${trade.price} @ ${trade.amount}`);
     *   }
     * }
     * ```
     */
    async watchTrades(
        outcomeId: string | MarketOutcome,
        address?: string,
        since?: number,
        limit?: number
    ): Promise<Trade[]> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const args: any[] = [resolvedOutcomeId];
            if (address !== undefined) {
                args.push(address);
            }
            if (since !== undefined) {
                args.push(since);
            }
            if (limit !== undefined) {
                args.push(limit);
            }

            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/watchTrades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertTrade);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch trades: ${error}`);
        }
    }

    /**
     * Watch real-time updates of a public wallet via WebSocket.
     *
     * Returns a promise that resolves with the next update(s).
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param address - Public wallet to be watched
     * @param types - Subscription options including 'trades', 'positions', and 'balances'
     * @returns Next update(s)
     *
     * @example
     * ```typescript
     * // Stream updates of a public wallet address
     * while (true) {
     *   const snapshots = await exchange.watchAddress(address, types);
     *   for (const snapshot of snapshots) {
     *     console.log(`Trade: ${snapshot.trades}`);
     *   }
     * }
     * ```
     */
    async watchAddress(
        address: string,
        types?: SubscriptionOption[],
    ): Promise<SubscribedAddressSnapshot> {
        await this.initPromise;
        try {
            const args: any[] = [address];
            if (types !== undefined) {
                args.push(types);
            }
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/watchAddress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertSubscriptionSnapshot(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch address: ${error}`);
        }
    }

    /**
     * Stop watching a previously registered wallet address and release its resource updates.
     *
     * @param address - Public wallet to be watched
     * @returns
     */
    async unwatchAddress(
        address: string,
    ): Promise<Trade[]> {
        await this.initPromise;
        try {
            const args: any[] = [address];

            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/unwatchAddress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to unwatch address: ${error}`);
        }
    }

    // Trading Methods (require authentication)

    /**
     * Build an order payload without submitting it to the exchange.
     * Returns the exchange-native signed order or transaction payload for
     * inspection, forwarding through a middleware layer, or deferred
     * submission via {@link submitOrder}.
     *
     * You can specify the market either with explicit marketId/outcomeId,
     * or by passing an outcome object directly (e.g., market.yes).
     *
     * @param params - Order parameters (same as createOrder)
     * @returns A BuiltOrder containing the exchange-native payload
     *
     * @example
     * ```typescript
     * // Build, inspect, then submit:
     * const built = await exchange.buildOrder({
     *   marketId: "663583",
     *   outcomeId: "10991849...",
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     *
     * console.log(built.signedOrder); // inspect before submitting
     * const order = await exchange.submitOrder(built);
     *
     * // Using outcome shorthand:
     * const built2 = await exchange.buildOrder({
     *   outcome: market.yes,
     *   side: "buy",
     *   type: "market",
     *   amount: 10
     * });
     * ```
     */
    async buildOrder(params: CreateOrderParams & { outcome?: MarketOutcome }): Promise<BuiltOrder> {
        await this.initPromise;
        try {
            let marketId = params.marketId;
            let outcomeId = params.outcomeId;

            if (params.outcome) {
                if (marketId !== undefined || outcomeId !== undefined) {
                    throw new PmxtError(
                        "Cannot specify both 'outcome' and 'marketId'/'outcomeId'. Use one or the other."
                    );
                }
                const outcome: MarketOutcome = params.outcome;
                if (!outcome.marketId) {
                    throw new PmxtError(
                        "outcome.marketId is not set. Ensure the outcome comes from a fetched market."
                    );
                }
                marketId = outcome.marketId;
                outcomeId = outcome.outcomeId;
            }

            const paramsDict: any = {
                marketId,
                outcomeId,
                side: params.side,
                type: params.type,
                amount: params.amount,
            };
            if (params.price !== undefined) {
                paramsDict.price = params.price;
            }
            if (params.fee !== undefined) {
                paramsDict.fee = params.fee;
            }

            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/buildOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [paramsDict], credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data as BuiltOrder;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to build order: ${error}`);
        }
    }

    /**
     * Submit a pre-built order returned by {@link buildOrder}.
     *
     * @param built - The BuiltOrder payload from buildOrder()
     * @returns The submitted order
     *
     * @example
     * ```typescript
     * const built = await exchange.buildOrder({
     *   outcome: market.yes,
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     * const order = await exchange.submitOrder(built);
     * console.log(order.id, order.status);
     * ```
     */
    async submitOrder(built: BuiltOrder): Promise<Order> {
        await this.initPromise;
        try {
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/submitOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [built as any], credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to submit order: ${error}`);
        }
    }

    /**
     * Create a new order.
     * 
     * @param params - Order parameters
     * @returns Created order
     * 
     * @example
     * ```typescript
     * const order = await exchange.createOrder({
     *   marketId: "663583",
     *   outcomeId: "10991849...",
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     * ```
     */
    async createOrder(params: any): Promise<Order> {
        await this.initPromise;
        try {
            // Resolve outcome shorthand: extract marketId/outcomeId from outcome object
            let marketId = params.marketId;
            let outcomeId = params.outcomeId;

            if (params.outcome) {
                if (marketId !== undefined || outcomeId !== undefined) {
                    throw new PmxtError(
                        "Cannot specify both 'outcome' and 'marketId'/'outcomeId'. Use one or the other."
                    );
                }
                const outcome: MarketOutcome = params.outcome;
                if (!outcome.marketId) {
                    throw new PmxtError(
                        "outcome.marketId is not set. Ensure the outcome comes from a fetched market."
                    );
                }
                marketId = outcome.marketId;
                outcomeId = outcome.outcomeId;
            }

            const paramsDict: any = {
                marketId,
                outcomeId,
                side: params.side,
                type: params.type,
                amount: params.amount,
            };
            if (params.price !== undefined) {
                paramsDict.price = params.price;
            }
            if (params.fee !== undefined) {
                paramsDict.fee = params.fee;
            }

            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/createOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [paramsDict], credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to create order: ${error}`);
        }
    }

    /**
     * Calculate the average execution price for a given amount by walking the order book.
     * Uses the sidecar server for calculation to ensure consistency.
     * 
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns The volume-weighted average price, or 0 if insufficient liquidity
     */
    async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number> {
        const result = await this.getExecutionPriceDetailed(orderBook, side, amount);
        return result.fullyFilled ? result.price : 0;
    }

    /**
     * Calculate detailed execution price information.
     * Uses the sidecar server for calculation to ensure consistency.
     * 
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns Detailed execution result
     */
    async getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): Promise<ExecutionPriceResult> {
        await this.initPromise;
        try {
            const body: any = {
                args: [orderBook, side, amount]
            };
            const credentials = this.getCredentials();
            if (credentials) {
                body.credentials = credentials;
            }

            const url = `${this.config.basePath}/api/${this.exchangeName}/getExecutionPriceDetailed`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to get execution price: ${error}`);
        }
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter markets based on criteria or custom function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of markets
     *
     * @example Simple text search
     * api.filterMarkets(markets, 'Trump')
     *
     * @example Advanced filtering
     * api.filterMarkets(markets, {
     *   text: 'Trump',
     *   searchIn: ['title', 'tags'],
     *   volume24h: { min: 10000 },
     *   category: 'Politics',
     *   price: { outcome: 'yes', max: 0.5 }
     * })
     *
     * @example Custom predicate
     * api.filterMarkets(markets, m => m.liquidity > 5000 && m.yes?.price < 0.3)
     */
    filterMarkets(
        markets: UnifiedMarket[],
        criteria: string | MarketFilterCriteria | MarketFilterFunction
    ): UnifiedMarket[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return markets.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return markets.filter(m =>
                m.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return markets.filter(market => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && market.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && market.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && market.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && market.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'outcomes' && market.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && market.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    market.tags?.some(marketTag =>
                        marketTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Volume24h filter
            if (criteria.volume24h) {
                if (criteria.volume24h.min !== undefined && market.volume24h < criteria.volume24h.min) {
                    return false;
                }
                if (criteria.volume24h.max !== undefined && market.volume24h > criteria.volume24h.max) {
                    return false;
                }
            }

            // Volume filter
            if (criteria.volume) {
                if (criteria.volume.min !== undefined && (market.volume || 0) < criteria.volume.min) {
                    return false;
                }
                if (criteria.volume.max !== undefined && (market.volume || 0) > criteria.volume.max) {
                    return false;
                }
            }

            // Liquidity filter
            if (criteria.liquidity) {
                if (criteria.liquidity.min !== undefined && market.liquidity < criteria.liquidity.min) {
                    return false;
                }
                if (criteria.liquidity.max !== undefined && market.liquidity > criteria.liquidity.max) {
                    return false;
                }
            }

            // OpenInterest filter
            if (criteria.openInterest) {
                if (criteria.openInterest.min !== undefined && (market.openInterest || 0) < criteria.openInterest.min) {
                    return false;
                }
                if (criteria.openInterest.max !== undefined && (market.openInterest || 0) > criteria.openInterest.max) {
                    return false;
                }
            }

            // ResolutionDate filter
            if (criteria.resolutionDate && market.resolutionDate) {
                const resDate = market.resolutionDate;
                if (criteria.resolutionDate.before && resDate >= criteria.resolutionDate.before) {
                    return false;
                }
                if (criteria.resolutionDate.after && resDate <= criteria.resolutionDate.after) {
                    return false;
                }
            }

            // Price filter (for binary markets)
            if (criteria.price) {
                const outcome = market[criteria.price.outcome];
                if (!outcome) return false;

                if (criteria.price.min !== undefined && outcome.price < criteria.price.min) {
                    return false;
                }
                if (criteria.price.max !== undefined && outcome.price > criteria.price.max) {
                    return false;
                }
            }

            // Price change filter
            if (criteria.priceChange24h) {
                const outcome = market[criteria.priceChange24h.outcome];
                if (!outcome || outcome.priceChange24h === undefined) return false;

                if (criteria.priceChange24h.min !== undefined && outcome.priceChange24h < criteria.priceChange24h.min) {
                    return false;
                }
                if (criteria.priceChange24h.max !== undefined && outcome.priceChange24h > criteria.priceChange24h.max) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Filter events based on criteria or custom function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of events
     *
     * @example Simple text search
     * api.filterEvents(events, 'Trump')
     *
     * @example Advanced filtering
     * api.filterEvents(events, {
     *   text: 'Election',
     *   searchIn: ['title', 'tags'],
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * })
     *
     * @example Custom predicate
     * api.filterEvents(events, e => e.markets.length > 10)
     */
    filterEvents(
        events: UnifiedEvent[],
        criteria: string | EventFilterCriteria | EventFilterFunction
    ): UnifiedEvent[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return events.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return events.filter(e =>
                e.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return events.filter(event => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && event.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && event.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && event.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && event.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && event.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    event.tags?.some(eventTag =>
                        eventTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Market count filter
            if (criteria.marketCount) {
                const count = event.markets.length;
                if (criteria.marketCount.min !== undefined && count < criteria.marketCount.min) {
                    return false;
                }
                if (criteria.marketCount.max !== undefined && count > criteria.marketCount.max) {
                    return false;
                }
            }

            // Total volume filter
            if (criteria.totalVolume) {
                const totalVolume = event.markets.reduce((sum, m) => sum + m.volume24h, 0);
                if (criteria.totalVolume.min !== undefined && totalVolume < criteria.totalVolume.min) {
                    return false;
                }
                if (criteria.totalVolume.max !== undefined && totalVolume > criteria.totalVolume.max) {
                    return false;
                }
            }

            return true;
        });
    }
}

/**
 * Polymarket exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const poly = new Polymarket();
 * const markets = await poly.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const poly = new Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
 * const balance = await poly.fetchBalance();
 * ```
 */
/**
 * Options for initializing Polymarket client.
 */
export interface PolymarketOptions {
    /** Private key for authentication (optional) */
    privateKey?: string;

    /** Base URL of the PMXT sidecar server */
    baseUrl?: string;

    /** Automatically start server if not running (default: true) */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type */
    signatureType?: 'eoa' | 'poly-proxy' | 'gnosis-safe' | number;
}

export class Polymarket extends Exchange {
    constructor(options: PolymarketOptions = {}) {
        // Default to gnosis-safe signature type
        const polyOptions = {
            signatureType: 'gnosis-safe',
            ...options
        };
        super("polymarket", polyOptions as ExchangeOptions);
    }
}

/**
 * Kalshi exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const kalshi = new Kalshi();
 * const markets = await kalshi.fetchMarkets({ query: "Fed rates" });
 *
 * // Trading (requires auth)
 * const kalshi = new Kalshi({
 *   apiKey: process.env.KALSHI_API_KEY,
 *   privateKey: process.env.KALSHI_PRIVATE_KEY
 * });
 * const balance = await kalshi.fetchBalance();
 * ```
 */
export class Kalshi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi", options);
    }
}

/**
 * Limitless exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const limitless = new Limitless();
 * const markets = await limitless.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const limitless = new Limitless({
 *   apiKey: process.env.LIMITLESS_API_KEY,
 *   privateKey: process.env.LIMITLESS_PRIVATE_KEY
 * });
 * const balance = await limitless.fetchBalance();
 * ```
 */
export class Limitless extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("limitless", options);
    }
}

/**
 * Kalshi Demo exchange client (paper trading / sandbox environment).
 *
 * Uses Kalshi's demo environment — same API as Kalshi but against test accounts.
 * Credentials are separate from production Kalshi credentials.
 *
 * @example
 * ```typescript
 * const kalshiDemo = new KalshiDemo({
 *   apiKey: process.env.KALSHI_DEMO_API_KEY,
 *   privateKey: process.env.KALSHI_DEMO_PRIVATE_KEY
 * });
 * const balance = await kalshiDemo.fetchBalance();
 * ```
 */
export class KalshiDemo extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi-demo", options);
    }
}

/**
 * Myriad exchange client.
 *
 * AMM-based prediction market exchange. Requires an API key for trading.
 * The `privateKey` field is used as the wallet address.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const myriad = new Myriad();
 * const markets = await myriad.fetchMarkets();
 *
 * // Trading (requires auth)
 * const myriad = new Myriad({
 *   apiKey: process.env.MYRIAD_API_KEY,
 *   privateKey: process.env.MYRIAD_WALLET_ADDRESS
 * });
 * ```
 */
export class Myriad extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("myriad", options);
    }
}

/**
 * Probable exchange client.
 *
 * BSC-based CLOB exchange. Requires all four credential fields for trading.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const probable = new Probable();
 * const markets = await probable.fetchMarkets();
 *
 * // Trading (requires auth)
 * const probable = new Probable({
 *   privateKey: process.env.PROBABLE_PRIVATE_KEY,
 *   apiKey: process.env.PROBABLE_API_KEY,
 *   apiSecret: process.env.PROBABLE_API_SECRET,
 *   passphrase: process.env.PROBABLE_PASSPHRASE
 * });
 * ```
 */
export class Probable extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("probable", options);
    }
}

/**
 * Baozi exchange client.
 *
 * Solana-based on-chain pari-mutuel betting exchange.
 * Requires a Solana private key for trading.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const baozi = new Baozi();
 * const markets = await baozi.fetchMarkets();
 *
 * // Trading (requires auth)
 * const baozi = new Baozi({
 *   privateKey: process.env.BAOZI_PRIVATE_KEY
 * });
 * ```
 */
export class Baozi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("baozi", options);
    }
}

/**
 * Opinion exchange client.
 *
 * Polygon-based CLOB exchange. Public catalog endpoints work without
 * credentials; trading requires `apiKey` (proxy address) and `privateKey`.
 *
 * @example
 * ```typescript
 * const opinion = new Opinion();
 * const events = await opinion.fetchEvents();
 * ```
 */
export class Opinion extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("opinion", options);
    }
}

/**
 * Metaculus exchange client.
 *
 * Forecasting platform. Public read-only access works without credentials;
 * authenticated calls accept a bearer token via `apiKey`.
 *
 * @example
 * ```typescript
 * const metaculus = new Metaculus();
 * const events = await metaculus.fetchEvents();
 * ```
 */
export class Metaculus extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("metaculus", options);
    }
}

/**
 * Smarkets exchange client.
 *
 * UK-based betting exchange. Public catalog endpoints work without
 * credentials; trading requires Smarkets account email (`apiKey`) and
 * password (`privateKey`).
 *
 * @example
 * ```typescript
 * const smarkets = new Smarkets();
 * const events = await smarkets.fetchEvents();
 * ```
 */
export class Smarkets extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("smarkets", options);
    }
}

/**
 * Polymarket US exchange client.
 *
 * US-regulated Polymarket venue. Public catalog endpoints work without
 * credentials; trading requires `apiKey` (keyId) and `privateKey`
 * (secretKey) issued by Polymarket US.
 *
 * @example
 * ```typescript
 * const polyUs = new PolymarketUS();
 * const events = await polyUs.fetchEvents();
 * ```
 */
export class PolymarketUS extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("polymarket_us", options);
    }
}
