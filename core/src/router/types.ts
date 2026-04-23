import type { UnifiedMarket, UnifiedEvent } from '../types';

// ---------------------------------------------------------------------------
// Relation types (matches the matching engine's SetRelation)
// ---------------------------------------------------------------------------

export type MatchRelation = 'identity' | 'subset' | 'superset' | 'overlap' | 'disjoint';

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface RouterOptions {
    apiKey: string;
    baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface MatchResult {
    market: UnifiedMarket;
    relation: MatchRelation;
    confidence: number;
    reasoning: string | null;
    bestBid: number | null;
    bestAsk: number | null;
}

export interface EventMatchResult {
    event: UnifiedEvent;
    marketMatches: MatchResult[];
}

export interface PriceComparison {
    market: UnifiedMarket;
    relation: MatchRelation;
    confidence: number;
    reasoning: string | null;
    bestBid: number | null;
    bestAsk: number | null;
    venue: string;
}

export interface ArbitrageOpportunity {
    marketA: UnifiedMarket;
    marketB: UnifiedMarket;
    spread: number;
    buyVenue: string;
    sellVenue: string;
    buyPrice: number;
    sellPrice: number;
    /** The set-theoretic relation between the two markets (e.g. identity, subset). */
    relation?: MatchRelation;
    /** Match confidence score (0.0 to 1.0). */
    confidence?: number;
}

// ---------------------------------------------------------------------------
// Param types
// ---------------------------------------------------------------------------

export interface FetchMarketMatchesParams {
    /** Pass a UnifiedMarket directly instead of marketId/slug/url. */
    market?: UnifiedMarket;
    marketId?: string;
    slug?: string;
    url?: string;
    relation?: MatchRelation;
    minConfidence?: number;
    limit?: number;
    includePrices?: boolean;
}

/** @deprecated Use {@link FetchMarketMatchesParams} instead. */
export type FetchMatchesParams = FetchMarketMatchesParams;

export interface FetchEventMatchesParams {
    /** Pass a UnifiedEvent directly instead of eventId/slug. */
    event?: UnifiedEvent;
    eventId?: string;
    slug?: string;
    relation?: MatchRelation;
    minConfidence?: number;
    limit?: number;
    includePrices?: boolean;
}

export interface FetchArbitrageParams {
    minSpread?: number;
    category?: string;
    limit?: number;
    /** Comma-separated relation types to include (default: 'identity'). */
    relations?: MatchRelation[];
}

export interface RouterMarketSearchParams {
    query?: string;
    sourceExchange?: string;
    category?: string;
    limit?: number;
    offset?: number;
    closed?: boolean;
}

export interface RouterEventSearchParams {
    query?: string;
    sourceExchange?: string;
    category?: string;
    limit?: number;
    offset?: number;
    closed?: boolean;
}
