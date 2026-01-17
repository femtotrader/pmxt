import axios from 'axios';
import { OrderBook } from '../../types';

export async function fetchOrderBook(id: string): Promise<OrderBook> {
    try {
        const ticker = id.replace(/-NO$/, '');
        const url = `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}/orderbook`;
        const response = await axios.get(url);
        const data = response.data.orderbook;

        // Structure: { yes: [[price, qty], ...], no: [[price, qty], ...] }
        const bids = (data.yes || []).map((level: number[]) => ({
            price: level[0] / 100,
            size: level[1]
        }));

        const asks = (data.no || []).map((level: number[]) => ({
            price: (100 - level[0]) / 100,
            size: level[1]
        }));

        // Sort bids desc, asks asc
        bids.sort((a: any, b: any) => b.price - a.price);
        asks.sort((a: any, b: any) => a.price - b.price);

        return { bids, asks, timestamp: Date.now() };
    } catch (error) {
        console.error(`Error fetching Kalshi orderbook for ${id}:`, error);
        return { bids: [], asks: [] };
    }
}
