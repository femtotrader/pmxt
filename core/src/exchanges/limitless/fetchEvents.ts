import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import axios from 'axios';
import { LIMITLESS_API_URL, mapMarketToUnified } from './utils';
import { limitlessErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams): Promise<UnifiedEvent[]> {
    if (params?.status === 'closed') {
        return [];
    }
    try {
        const response = await axios.get(`${LIMITLESS_API_URL}/markets/search`, {
            params: {
                query: params.query,
                limit: params?.limit || 10000
            }
        });

        const markets = response.data?.markets || [];

        return markets.map((market: any) => {
            let marketsList: UnifiedMarket[] = [];

            if (market.markets && Array.isArray(market.markets)) {
                marketsList = market.markets
                    .map((child: any) => mapMarketToUnified(child))
                    .filter((m: any): m is UnifiedMarket => m !== null);
            } else {
                const unifiedMarket = mapMarketToUnified(market);
                if (unifiedMarket) marketsList = [unifiedMarket];
            }

            return {
                id: market.slug,
                title: market.title || market.question,
                description: market.description || '',
                slug: market.slug,
                markets: marketsList,
                url: `https://limitless.exchange/markets/${market.slug}`,
                image: market.logo || `https://limitless.exchange/api/og?slug=${market.slug}`,
                category: market.categories?.[0],
                tags: market.tags || []
            } as UnifiedEvent;
        });

    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
