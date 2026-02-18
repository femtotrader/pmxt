import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import { mapMarketToUnified } from './utils';
import { kalshiErrorMapper } from './errors';

type CallApi = (operationId: string, params?: Record<string, any>) => Promise<any>;

async function fetchEventByTicker(eventTicker: string, callApi: CallApi): Promise<UnifiedEvent[]> {
    const normalizedTicker = eventTicker.toUpperCase();
    const data = await callApi('GetEvent', { event_ticker: normalizedTicker, with_nested_markets: true });

    const event = data.event;
    if (!event) return [];

    const markets: UnifiedMarket[] = [];
    if (event.markets) {
        for (const market of event.markets) {
            const unifiedMarket = mapMarketToUnified(event, market);
            if (unifiedMarket) {
                markets.push(unifiedMarket);
            }
        }
    }

    const unifiedEvent: UnifiedEvent = {
        id: event.event_ticker,
        title: event.title,
        description: event.mututals_description || "",
        slug: event.event_ticker,
        markets: markets,
        url: `https://kalshi.com/events/${event.event_ticker}`,
        image: event.image_url,
        category: event.category,
        tags: event.tags || []
    };
    return [unifiedEvent];
}

export async function fetchEvents(params: EventFetchParams, callApi: CallApi): Promise<UnifiedEvent[]> {
    try {
        // Handle eventId lookup (direct API call)
        if (params.eventId) {
            return await fetchEventByTicker(params.eventId, callApi);
        }

        // Handle slug lookup (slug IS the event ticker on Kalshi)
        if (params.slug) {
            return await fetchEventByTicker(params.slug, callApi);
        }

        const status = params?.status || 'active';
        const limit = params?.limit || 10000;
        const query = (params?.query || '').toLowerCase();

        const fetchAllWithStatus = async (apiStatus: string) => {
            let allEvents: any[] = [];
            let cursor = null;
            let page = 0;

            const MAX_PAGES = 1000; // Safety cap against infinite loops
            const BATCH_SIZE = 200; // Max limit per Kalshi API docs

            do {
                const queryParams: any = {
                    limit: BATCH_SIZE,
                    with_nested_markets: true,
                    status: apiStatus
                };
                if (cursor) queryParams.cursor = cursor;

                const data = await callApi('GetEvents', queryParams);
                const events = data.events || [];

                if (events.length === 0) break;

                allEvents = allEvents.concat(events);
                cursor = data.cursor;
                page++;

                // If we have no search query and have fetched enough events, we can stop early
                if (!query && allEvents.length >= limit * 1.5) {
                    break;
                }

            } while (cursor && page < MAX_PAGES);

            return allEvents;
        };

        let events = [];
        if (status === 'all') {
            const [openEvents, closedEvents, settledEvents] = await Promise.all([
                fetchAllWithStatus('open'),
                fetchAllWithStatus('closed'),
                fetchAllWithStatus('settled')
            ]);
            events = [...openEvents, ...closedEvents, ...settledEvents];
        } else if (status === 'closed' || status === 'inactive') {
            const [closedEvents, settledEvents] = await Promise.all([
                fetchAllWithStatus('closed'),
                fetchAllWithStatus('settled')
            ]);
            events = [...closedEvents, ...settledEvents];
        } else {
            events = await fetchAllWithStatus('open');
        }

        const filtered = events.filter((event: any) => {
            return (event.title || '').toLowerCase().includes(query);
        });

        const unifiedEvents: UnifiedEvent[] = filtered.map((event: any) => {
            const markets: UnifiedMarket[] = [];
            if (event.markets) {
                for (const market of event.markets) {
                    const unifiedMarket = mapMarketToUnified(event, market);
                    if (unifiedMarket) {
                        markets.push(unifiedMarket);
                    }
                }
            }

            const unifiedEvent: UnifiedEvent = {
                id: event.event_ticker,
                title: event.title,
                description: event.mututals_description || "",
                slug: event.event_ticker,
                markets: markets,
                url: `https://kalshi.com/events/${event.event_ticker}`,
                image: event.image_url,
                category: event.category,
                tags: event.tags || []
            };
            return unifiedEvent;
        });

        return unifiedEvents.slice(0, limit);

    } catch (error: any) {
        throw kalshiErrorMapper.mapError(error);
    }
}
