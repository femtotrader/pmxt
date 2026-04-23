import {
    PredictionMarketExchange,
    type ExchangeCredentials,
    type MarketFetchParams,
    type EventFetchParams,
} from '../BaseExchange';
import type { UnifiedMarket, UnifiedEvent } from '../types';
import { PmxtApiClient } from './client';
import type {
    RouterOptions,
    MatchResult,
    EventMatchResult,
    PriceComparison,
    ArbitrageOpportunity,
    FetchMarketMatchesParams,
    FetchMatchesParams,
    FetchEventMatchesParams,
    FetchArbitrageParams,
} from './types';

export class Router extends PredictionMarketExchange {
    private readonly client: PmxtApiClient;

    constructor(options: RouterOptions) {
        super({ apiKey: options.apiKey } as ExchangeCredentials);
        this.client = new PmxtApiClient(options.apiKey, options.baseUrl);
        this.rateLimit = 100;
    }

    get name(): string {
        return 'Router';
    }

    // -----------------------------------------------------------------------
    // BaseExchange implementation delegates
    // -----------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        const response = await this.client.searchMarkets({
            query: params?.query,
            category: params?.category,
            limit: params?.limit,
            offset: params?.offset,
            closed: params?.status === 'closed' || params?.status === 'inactive',
        });
        return response ?? [];
    }

    protected async fetchEventsImpl(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        const response = await this.client.searchEvents({
            query: params?.query,
            category: params?.category,
            limit: params?.limit,
            offset: params?.offset,
        });
        return response ?? [];
    }

    // -----------------------------------------------------------------------
    // Cross-exchange market matches
    // -----------------------------------------------------------------------

    async fetchMarketMatches(params: FetchMarketMatchesParams): Promise<MatchResult[]> {
        if (params.market && !params.marketId) {
            params = { ...params, marketId: params.market.marketId };
        }
        const response = await this.client.getMarketMatches(params);
        const matches = response.matches ?? [];
        return matches.map((m: any) => ({
            market: m.market,
            relation: m.relation,
            confidence: m.confidence,
            reasoning: m.reasoning ?? null,
            bestBid: m.market?.bestBid ?? null,
            bestAsk: m.market?.bestAsk ?? null,
        }));
    }

    /** @deprecated Use {@link fetchMarketMatches} instead. */
    async fetchMatches(params: FetchMatchesParams): Promise<MatchResult[]> {
        console.warn('[pmxt] fetchMatches is deprecated, use fetchMarketMatches instead');
        return this.fetchMarketMatches(params);
    }

    // -----------------------------------------------------------------------
    // Cross-exchange event matches
    // -----------------------------------------------------------------------

    async fetchEventMatches(params: FetchEventMatchesParams): Promise<EventMatchResult[]> {
        if (params.event && !params.eventId) {
            params = { ...params, eventId: params.event.id };
        }
        const response = await this.client.getEventMatches(params);
        return response.matches ?? [];
    }

    // -----------------------------------------------------------------------
    // Price comparison: identity matches with live prices
    // -----------------------------------------------------------------------

    async compareMarketPrices(params: FetchMarketMatchesParams): Promise<PriceComparison[]> {
        if (params.market && !params.marketId) {
            params = { ...params, marketId: params.market.marketId };
        }
        const matches = await this.fetchMarketMatches({
            ...params,
            relation: 'identity',
            includePrices: true,
        });

        return matches.map((m) => ({
            market: m.market,
            relation: m.relation,
            confidence: m.confidence,
            reasoning: m.reasoning,
            bestBid: m.bestBid,
            bestAsk: m.bestAsk,
            venue: m.market.sourceExchange ?? '',
        }));
    }

    // -----------------------------------------------------------------------
    // Hedging: subset/superset matches with live prices
    // -----------------------------------------------------------------------

    async fetchHedges(params: FetchMarketMatchesParams): Promise<PriceComparison[]> {
        if (params.market && !params.marketId) {
            params = { ...params, marketId: params.market.marketId };
        }
        const matches = await this.fetchMarketMatches({
            ...params,
            includePrices: true,
        });

        return matches
            .filter((m) => m.relation === 'subset' || m.relation === 'superset')
            .map((m) => ({
                market: m.market,
                relation: m.relation,
                confidence: m.confidence,
                reasoning: m.reasoning,
                bestBid: m.bestBid,
                bestAsk: m.bestAsk,
                venue: m.market.sourceExchange ?? '',
            }));
    }

    // -----------------------------------------------------------------------
    // Arbitrage: scan matches for price spreads
    // -----------------------------------------------------------------------

    async fetchArbitrage(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        // Try the dedicated bulk endpoint first (single DB query).
        try {
            return await this.fetchArbitrageBulk(params);
        } catch {
            // Dedicated endpoint not available — fall back to N+1 approach.
            return this.fetchArbitrageFallback(params);
        }
    }

    /**
     * Bulk arbitrage via `GET /v0/arbitrage`. One round-trip.
     */
    private async fetchArbitrageBulk(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        const query: Record<string, string> = {};
        const relations = params?.relations ?? ['identity'];
        query.relations = relations.join(',');
        if (params?.minSpread !== undefined) query.minSpread = String(params.minSpread);
        if (params?.category) query.category = params.category;
        if (params?.limit !== undefined) query.limit = String(params.limit);

        const res = await this.client.getArbitrage(query);
        const items: any[] = res.data ?? [];

        return items.map((r: any) => ({
            marketA: r.marketA,
            marketB: r.marketB,
            spread: r.spread ?? 0,
            buyVenue: r.buyVenue ?? '',
            sellVenue: r.sellVenue ?? '',
            buyPrice: r.buyPrice ?? 0,
            sellPrice: r.sellPrice ?? 0,
            relation: r.relation,
            confidence: r.confidence,
        }));
    }

    /**
     * Legacy N+1 fallback: fetch markets, then fetch matches per-market.
     */
    private async fetchArbitrageFallback(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        const minSpread = params?.minSpread ?? 0;
        const limit = params?.limit ?? 50;
        const relations = params?.relations ?? ['identity'];

        const markets = await this.fetchMarkets({
            category: params?.category,
            limit,
        });

        const opportunities: ArbitrageOpportunity[] = [];

        for (const market of markets) {
            for (const relation of relations) {
                const matches = await this.fetchMarketMatches({
                    marketId: market.marketId,
                    relation,
                    includePrices: true,
                });
                if (matches.length === 0) continue;

                const sourceAsk = market.outcomes[0]?.price ?? null;
                const sourceBid = sourceAsk;
                const sourceVenue = market.sourceExchange ?? '';

                for (const match of matches) {
                    const matchBid = match.bestBid;
                    const matchAsk = match.bestAsk;
                    const matchVenue = match.market.sourceExchange ?? '';

                    if (sourceAsk !== null && matchBid !== null) {
                        const spread = matchBid - sourceAsk;
                        if (spread >= minSpread) {
                            opportunities.push({
                                marketA: market,
                                marketB: match.market,
                                spread,
                                buyVenue: sourceVenue,
                                sellVenue: matchVenue,
                                buyPrice: sourceAsk,
                                sellPrice: matchBid,
                                relation: match.relation,
                                confidence: match.confidence,
                            });
                        }
                    }

                    if (matchAsk !== null && sourceBid !== null) {
                        const spread = sourceBid - matchAsk;
                        if (spread >= minSpread) {
                            opportunities.push({
                                marketA: match.market,
                                marketB: market,
                                spread,
                                buyVenue: matchVenue,
                                sellVenue: sourceVenue,
                                buyPrice: matchAsk,
                                sellPrice: sourceBid,
                                relation: match.relation,
                                confidence: match.confidence,
                            });
                        }
                    }
                }
            }
        }

        opportunities.sort((a, b) => b.spread - a.spread);
        return opportunities;
    }
}
