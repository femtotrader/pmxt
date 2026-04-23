/**
 * Router — cross-venue intelligence layer.
 *
 * Search, match, compare prices, find hedges, and detect arbitrage across
 * every venue PMXT supports. Only requires a PMXT API key.
 */

import { Exchange, ExchangeOptions } from "./client.js";
import {
    MatchResult,
    MatchRelation,
    EventMatchResult,
    PriceComparison,
    ArbitrageOpportunity,
    UnifiedMarket,
    UnifiedEvent,
} from "./models.js";

function convertMarket(raw: any): UnifiedMarket {
    const outcomes = (raw.outcomes || []).map((o: any) => ({
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
        sourceExchange: raw.sourceExchange,
        eventId: raw.eventId,
        yes: convertOutcome(raw.yes),
        no: convertOutcome(raw.no),
        up: convertOutcome(raw.up),
        down: convertOutcome(raw.down),
    };
}

function convertEvent(raw: any): UnifiedEvent {
    return {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        slug: raw.slug,
        markets: (raw.markets || []).map(convertMarket),
        volume24h: raw.volume24h,
        volume: raw.volume,
        url: raw.url,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
        sourceExchange: raw.sourceExchange,
    };
}

function parseMatchResult(raw: any): MatchResult {
    const marketData = raw.market || {};
    return {
        market: convertMarket(marketData),
        relation: raw.relation || 'identity',
        confidence: raw.confidence || 0,
        reasoning: raw.reasoning,
        bestBid: raw.bestBid ?? marketData.bestBid,
        bestAsk: raw.bestAsk ?? marketData.bestAsk,
    };
}

/** Options for creating a Router. */
export interface RouterOptions {
    /** PMXT API key (required for hosted mode). */
    pmxtApiKey?: string;

    /** Override the base URL (defaults to hosted API). */
    baseUrl?: string;

    /** Start local sidecar (default: false). */
    autoStartServer?: boolean;
}

/**
 * Cross-venue intelligence layer.
 *
 * Search markets and events across every venue, find semantically
 * equivalent markets on other platforms, compare prices, discover
 * hedges, and scan for arbitrage — all from a single PMXT API key.
 *
 * @example
 * ```typescript
 * import pmxt from "pmxtjs";
 *
 * const router = new pmxt.Router({ pmxtApiKey: "pmxt_live_..." });
 * const markets = await router.fetchMarkets({ query: "election" });
 * const matches = await router.fetchMarketMatches({ market: markets[0] });
 * ```
 */
export class Router extends Exchange {
    constructor(options: RouterOptions = {}) {
        super("router", options as ExchangeOptions);
    }

    // ------------------------------------------------------------------
    // Matching
    // ------------------------------------------------------------------

    /**
     * Find markets on other venues that correspond to a given market.
     *
     * @param params.market - A UnifiedMarket object (extracts marketId automatically).
     * @param params.marketId - PMXT market ID.
     * @param params.slug - Market slug (alternative to marketId).
     * @param params.url - Market URL on the source venue.
     * @param params.relation - Filter to a specific relation type.
     * @param params.minConfidence - Minimum confidence threshold (0–1).
     * @param params.limit - Maximum number of matches to return.
     * @param params.includePrices - Attach live bestBid/bestAsk to each match.
     */
    async fetchMarketMatches(params: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    } = {}): Promise<MatchResult[]> {
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? params.market?.marketId;
        if (marketId) query.marketId = marketId;
        if (params.slug) query.slug = params.slug;
        if (params.url) query.url = params.url;
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = params.minConfidence;
        if (params.limit !== undefined) query.limit = params.limit;
        if (params.includePrices) query.includePrices = true;

        try {
            const json = await this.sidecarReadRequest('fetchMatches', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map(parseMatchResult);
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchMarketMatches: ${error}`);
        }
    }

    /**
     * @deprecated Use {@link fetchMarketMatches} instead.
     */
    async fetchMatches(params: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    } = {}): Promise<MatchResult[]> {
        console.warn('[pmxt] fetchMatches is deprecated, use fetchMarketMatches instead');
        return this.fetchMarketMatches(params);
    }

    /**
     * Match an entire event across venues.
     *
     * @param params.event - A UnifiedEvent object (extracts id automatically).
     * @param params.eventId - PMXT event ID.
     * @param params.slug - Event slug.
     * @param params.relation - Filter market matches to a specific relation type.
     * @param params.minConfidence - Minimum confidence threshold (0–1).
     * @param params.limit - Maximum number of event matches to return.
     * @param params.includePrices - Attach live prices to each market match.
     */
    async fetchEventMatches(params: {
        event?: UnifiedEvent;
        eventId?: string;
        slug?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    } = {}): Promise<EventMatchResult[]> {
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const eventId = params.eventId ?? params.event?.id;
        if (eventId) query.eventId = eventId;
        if (params.slug) query.slug = params.slug;
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = params.minConfidence;
        if (params.limit !== undefined) query.limit = params.limit;
        if (params.includePrices) query.includePrices = true;

        try {
            const json = await this.sidecarReadRequest('fetchEventMatches', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((entry) => ({
                event: convertEvent(entry.event || {}),
                marketMatches: (entry.marketMatches || []).map(parseMatchResult),
            }));
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchEventMatches: ${error}`);
        }
    }

    // ------------------------------------------------------------------
    // Price comparison
    // ------------------------------------------------------------------

    /**
     * Compare prices for the same market across venues.
     *
     * @param params.market - A UnifiedMarket object (extracts marketId automatically).
     * @param params.marketId - PMXT market ID.
     * @param params.slug - Market slug.
     * @param params.url - Market URL.
     */
    async compareMarketPrices(params: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
    } = {}): Promise<PriceComparison[]> {
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? params.market?.marketId;
        if (marketId) query.marketId = marketId;
        if (params.slug) query.slug = params.slug;
        if (params.url) query.url = params.url;

        try {
            const url = `${this.config.basePath}/api/${this.exchangeName}/compareMarketPrices`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [query], credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === 'object') {
                    const { fromServerError } = await import('./errors.js');
                    throw fromServerError(body.error);
                }
                throw new Error(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((r) => ({
                market: convertMarket(r.market || {}),
                relation: r.relation || 'identity',
                confidence: r.confidence || 0,
                reasoning: r.reasoning,
                bestBid: r.bestBid,
                bestAsk: r.bestAsk,
                venue: r.venue || '',
            }));
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to compareMarketPrices: ${error}`);
        }
    }

    // ------------------------------------------------------------------
    // Hedging
    // ------------------------------------------------------------------

    /**
     * Find markets that partially hedge a position.
     *
     * @param params.market - A UnifiedMarket object (extracts marketId automatically).
     * @param params.marketId - PMXT market ID.
     * @param params.slug - Market slug.
     * @param params.url - Market URL.
     */
    async fetchHedges(params: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
    } = {}): Promise<PriceComparison[]> {
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? params.market?.marketId;
        if (marketId) query.marketId = marketId;
        if (params.slug) query.slug = params.slug;
        if (params.url) query.url = params.url;

        try {
            const json = await this.sidecarReadRequest('fetchHedges', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((r) => ({
                market: convertMarket(r.market || {}),
                relation: r.relation || 'identity',
                confidence: r.confidence || 0,
                reasoning: r.reasoning,
                bestBid: r.bestBid,
                bestAsk: r.bestAsk,
                venue: r.venue || '',
            }));
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchHedges: ${error}`);
        }
    }

    // ------------------------------------------------------------------
    // Arbitrage
    // ------------------------------------------------------------------

    /**
     * Scan for cross-venue arbitrage opportunities.
     *
     * @param params.minSpread - Only return pairs with spread >= this value.
     * @param params.category - Filter source markets by category.
     * @param params.limit - Max source markets to scan (default: 50).
     * @param params.relations - Relation types to include (default: ['identity']).
     */
    async fetchArbitrage(params: {
        minSpread?: number;
        category?: string;
        limit?: number;
        relations?: MatchRelation[];
    } = {}): Promise<ArbitrageOpportunity[]> {
        await this.initPromise;
        const query: Record<string, unknown> = {};
        if (params.minSpread !== undefined) query.minSpread = params.minSpread;
        if (params.category) query.category = params.category;
        if (params.limit !== undefined) query.limit = params.limit;
        if (params.relations && params.relations.length > 0) {
            query.relations = params.relations.join(',');
        }

        try {
            const json = await this.sidecarReadRequest('fetchArbitrage', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((r) => ({
                marketA: convertMarket(r.marketA || {}),
                marketB: convertMarket(r.marketB || {}),
                spread: r.spread || 0,
                buyVenue: r.buyVenue || '',
                sellVenue: r.sellVenue || '',
                buyPrice: r.buyPrice || 0,
                sellPrice: r.sellPrice || 0,
                relation: r.relation,
                confidence: r.confidence,
            }));
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchArbitrage: ${error}`);
        }
    }
}
