import axios from 'axios';
import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { GAMMA_API_URL, mapMarketToUnified, paginateParallel } from './utils';
import { polymarketErrorMapper } from './errors';

export async function fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
    try {
        // Handle slug-based lookup
        if (params?.slug) {
            return await fetchMarketsBySlug(params.slug);
        }

        // Handle query-based search
        if (params?.query) {
            return await searchMarkets(params.query, params);
        }

        // Default: fetch markets
        return await fetchMarketsDefault(params);
    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}

async function fetchMarketsBySlug(slug: string): Promise<UnifiedMarket[]> {
    const response = await axios.get(GAMMA_API_URL, {
        params: { slug: slug }
    });

    const events = response.data;
    if (!events || events.length === 0) return [];

    const unifiedMarkets: UnifiedMarket[] = [];

    for (const event of events) {
        if (!event.markets) continue;

        for (const market of event.markets) {
            const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
            if (unifiedMarket) {
                unifiedMarkets.push(unifiedMarket);
            }
        }
    }
    return unifiedMarkets;
}

async function searchMarkets(query: string, params?: MarketFetchParams): Promise<UnifiedMarket[]> {
    const searchLimit = 5000; // Fetch enough markets for a good search pool

    // Fetch markets with a higher limit
    const markets = await fetchMarketsDefault({
        ...params,
        limit: searchLimit
    });

    // Client-side text filtering
    const lowerQuery = query.toLowerCase();
    const searchIn = params?.searchIn || 'title'; // Default to title-only search

    const filtered = markets.filter(market => {
        const titleMatch = (market.title || '').toLowerCase().includes(lowerQuery);
        const descMatch = (market.description || '').toLowerCase().includes(lowerQuery);

        if (searchIn === 'title') return titleMatch;
        if (searchIn === 'description') return descMatch;
        return titleMatch || descMatch; // 'both'
    });

    // Apply limit to filtered results
    const limit = params?.limit || 20;
    return filtered.slice(0, limit);
}

async function fetchMarketsDefault(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 200;  // Higher default for better coverage
    const offset = params?.offset || 0;

    // Map generic sort params to Polymarket Gamma API params
    let queryParams: any = {
        limit: limit,
        offset: offset,
    };

    const status = params?.status || 'active';

    if (status === 'active') {
        queryParams.active = 'true';
        queryParams.closed = 'false';
    } else if (status === 'closed') {
        queryParams.active = 'false';
        queryParams.closed = 'true';
    } else {
        // 'all' - don't filter by status
    }

    // Gamma API uses 'order' and 'ascending' for sorting
    if (params?.sort === 'volume') {
        queryParams.order = 'volume';
        queryParams.ascending = 'false';
    } else if (params?.sort === 'newest') {
        queryParams.order = 'startDate';
        queryParams.ascending = 'false';
    } else if (params?.sort === 'liquidity') {
        // queryParams.order = 'liquidity';
    } else {
        // Default to volume sort to ensure we get active markets
        queryParams.order = 'volume';
        queryParams.ascending = 'false';
    }

    try {
        // Fetch active events from Gamma using parallel pagination
        const events = await paginateParallel(GAMMA_API_URL, queryParams);
        const unifiedMarkets: UnifiedMarket[] = [];

        for (const event of events) {
            // Each event is a container (e.g. "US Election").
            // It contains specific "markets" (e.g. "Winner", "Pop Vote").
            if (!event.markets) continue;

            for (const market of event.markets) {
                const unifiedMarket = mapMarketToUnified(event, market);
                if (unifiedMarket) {
                    unifiedMarkets.push(unifiedMarket);
                }
            }
        }

        // Client-side Sort capability to ensure contract fulfillment
        // Often API filters are "good effort" or apply to the 'event' but not the 'market'
        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'newest') {
            // unifiedMarkets.sort((a, b) => b.resolutionDate.getTime() - a.resolutionDate.getTime()); // Not quite 'newest'
        } else if (params?.sort === 'liquidity') {
            unifiedMarkets.sort((a, b) => b.liquidity - a.liquidity);
        } else {
            // Default volume sort
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        }

        // Respect limit strictly after flattening
        return unifiedMarkets.slice(0, limit);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
