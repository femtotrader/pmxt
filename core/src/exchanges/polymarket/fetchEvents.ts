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
            limit_per_type: 50,
            sort: 'volume',
            ascending: false
        };

        const fetchWithStatus = async (eventStatus: string | undefined) => {
            const currentParams = { ...queryParams, events_status: eventStatus };
            return paginateSearchParallel(GAMMA_SEARCH_URL, currentParams, limit * 10);
        };

        // Client-side filtering logic
        // The API returns active events when querying for 'closed' status sometimes.
        // We must strictly filter based on the event's `active` and `closed` properties.
        const filterActive = (e: any) => e.active === true;
        const filterClosed = (e: any) => e.closed === true;

        let events: any[] = [];
        if (status === 'all') {
            const [activeEvents, closedEvents] = await Promise.all([
                fetchWithStatus('active'),
                fetchWithStatus('closed')
            ]);

            // Merge and de-duplicate by ID
            const seenIds = new Set();
            events = [...activeEvents, ...closedEvents].filter(event => {
                const id = event.id || event.slug;
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            });
        } else if (status === 'active') {
            const rawEvents = await fetchWithStatus('active');
            events = rawEvents.filter(filterActive);
        } else if (status === 'inactive' || status === 'closed') {
            // Polymarket sometimes returns active events when querying for closed
            // So we fetch 'closed' but strictly filter
            const rawEvents = await fetchWithStatus('closed');
            events = rawEvents.filter(filterClosed);
        }

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

        return unifiedEvents.slice(0, limit);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
