import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import { GAMMA_SEARCH_URL, mapMarketToUnified, paginateSearchParallel } from './utils';
import { polymarketErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams): Promise<UnifiedEvent[]> {
    try {
        if (!params.query) {
            // If no query is provided, we can't use the search endpoint effectively.
            // However, the BaseExchange interface enforces query presence for fetchEvents.
            // Just in case, we return empty or throw.
            throw new Error("Query is required for Polymarket event search");
        }

        const limit = params.limit || 10000;
        const status = params.status || 'active';

        const queryParams: any = {
            q: params.query,
            limit_per_type: 50, // Fetch 50 per page for better efficiency
            events_status: status === 'all' ? undefined : status,
            sort: 'volume',
            ascending: false
        };

        // If specific status requested
        if (status === 'active') {
            queryParams.events_status = 'active';
        } else if (status === 'closed') {
            queryParams.events_status = 'closed';
        }

        // Use parallel pagination to fetch all matching events
        const events = await paginateSearchParallel(GAMMA_SEARCH_URL, queryParams, limit * 10);

        // Client-side filtering to ensure title matches (API does fuzzy search)
        const lowerQuery = params.query.toLowerCase();
        const searchIn = params.searchIn || 'title';

        const filteredEvents = events.filter((event: any) => {
            const titleMatch = (event.title || '').toLowerCase().includes(lowerQuery);
            const descMatch = (event.description || '').toLowerCase().includes(lowerQuery);

            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch; // 'both'
        });

        // Map events to UnifiedEvent
        const unifiedEvents: UnifiedEvent[] = filteredEvents.map((event: any) => {
            const markets: UnifiedMarket[] = [];

            if (event.markets && Array.isArray(event.markets)) {
                for (const market of event.markets) {
                    const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
                    if (unifiedMarket) {
                        markets.push(unifiedMarket);
                    }
                }
            }

            const unifiedEvent: UnifiedEvent = {
                id: event.id || event.slug,
                title: event.title,
                description: event.description || '',
                slug: event.slug,
                markets: markets,
                url: `https://polymarket.com/event/${event.slug}`,
                image: event.image || `https://polymarket.com/api/og?slug=${event.slug}`,
                category: event.category || event.tags?.[0]?.label,
                tags: event.tags?.map((t: any) => t.label) || []
            };

            return unifiedEvent;
        });

        return unifiedEvents;

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
