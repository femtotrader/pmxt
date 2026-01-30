import axios from 'axios';
import { HistoryFilterParams } from '../../BaseExchange';
import { Trade } from '../../types';
import { LIMITLESS_API_URL } from './utils';

/**
 * Fetch trade history for a specific market or user.
 * @param id - The market slug or wallet address
 */
export async function fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
    try {
        // No public /trades endpoint was discovered in the new API.
        // Portfolio trades are available at /portfolio/trades for the authenticated user.
        const url = `${LIMITLESS_API_URL}/portfolio/trades`;

        const requestParams: any = {
            limit: params.limit || 100
        };

        if (params.start) {
            requestParams.after = Math.floor(params.start.getTime() / 1000);
        }

        if (params.end) {
            requestParams.before = Math.floor(params.end.getTime() / 1000);
        }

        const response = await axios.get(url, {
            params: requestParams
        });

        const tradesData = response.data?.data || response.data || [];

        let trades: Trade[] = tradesData.map((trade: any) => {
            const price = parseFloat(trade.price);
            const timestamp = Number(trade.timestamp);

            // Handle side mapping
            let side: 'buy' | 'sell' | 'unknown' = 'unknown';
            const rawSide = trade.side?.toLowerCase();
            if (rawSide === 'buy') side = 'buy';
            else if (rawSide === 'sell') side = 'sell';

            return {
                id: trade.id || `${timestamp}-${price}`,
                timestamp: timestamp * 1000,
                price: price,
                amount: parseFloat(trade.size || trade.amount || 0),
                side: side
            };
        });

        // Sort by timestamp descending (newest first)
        trades.sort((a, b) => b.timestamp - a.timestamp);

        // Apply limit locally if needed (though API should handle it)
        if (params.limit) {
            trades = trades.slice(0, params.limit);
        }

        return trades;

    } catch (error: any) {
        console.error(`Error fetching Limitless trades for ${id}:`, error.message);
        return [];
    }
}
