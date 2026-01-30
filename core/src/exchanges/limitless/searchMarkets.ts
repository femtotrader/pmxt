import axios from 'axios';
import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { LIMITLESS_API_URL, mapMarketToUnified } from './utils';

export async function searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    try {
        const response = await axios.get(`${LIMITLESS_API_URL}/markets/search`, {
            params: {
                query: query,
                limit: params?.limit || 20
            }
        });

        const markets = response.data?.markets || [];

        return markets
            .map((m: any) => mapMarketToUnified(m))
            .filter((m: any): m is UnifiedMarket => m !== null)
            .slice(0, params?.limit || 20);

    } catch (error: any) {
        console.error("Error searching Limitless data:", error.message);
        return [];
    }
}
