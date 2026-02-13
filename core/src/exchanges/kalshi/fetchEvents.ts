import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import axios from 'axios';
import { KALSHI_API_URL, mapMarketToUnified } from './utils';
import { kalshiErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams): Promise<UnifiedEvent[]> {
    try {
        const status = params?.status || 'active';
        const limit = params?.limit || 10000;
        const query = (params?.query || '').toLowerCase();

        const fetchWithStatus = async (apiStatus: string) => {
            const queryParams: any = {
                limit: 200,
                with_nested_markets: true,
                status: apiStatus
            };
            const response = await axios.get(KALSHI_API_URL, { params: queryParams });
            return response.data.events || [];
        };

        let events = [];
        if (status === 'all') {
            const [openEvents, closedEvents] = await Promise.all([
                fetchWithStatus('open'),
                fetchWithStatus('closed')
            ]);
            events = [...openEvents, ...closedEvents];
        } else {
            events = await fetchWithStatus(status === 'closed' ? 'closed' : 'open');
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
