import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import axios from 'axios';
import { KALSHI_API_URL, mapMarketToUnified } from './utils';
import { kalshiErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams): Promise<UnifiedEvent[]> {
    try {
        const status = params?.status || 'active';
        let apiStatus = 'open';
        if (status === 'closed') apiStatus = 'closed';

        const queryParams: any = {
            limit: 200, // Reasonable batch for search
            with_nested_markets: true,
            status: apiStatus
        };

        const response = await axios.get(KALSHI_API_URL, { params: queryParams });
        const events = response.data.events || [];

        const lowerQuery = (params?.query || '').toLowerCase();

        const filtered = events.filter((event: any) => {
            return (event.title || '').toLowerCase().includes(lowerQuery);
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

        const limit = params?.limit || 20;
        return unifiedEvents.slice(0, limit);

    } catch (error: any) {
        throw kalshiErrorMapper.mapError(error);
    }
}
