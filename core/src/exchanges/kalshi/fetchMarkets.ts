import axios from 'axios';
import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { KALSHI_API_URL, KALSHI_SERIES_URL, mapMarketToUnified } from './utils';

async function fetchActiveEvents(targetMarketCount?: number): Promise<any[]> {
    let allEvents: any[] = [];
    let totalMarketCount = 0;
    let cursor = null;
    let page = 0;

    // Note: Kalshi API uses cursor-based pagination which requires sequential fetching.
    // We cannot parallelize requests for a single list because we need the cursor from page N to fetch page N+1.
    // To optimize, we use the maximum allowed limit (200) and fetch until exhaustion.

    const MAX_PAGES = 1000; // Safety cap against infinite loops
    const BATCH_SIZE = 200; // Max limit per Kalshi API docs

    do {
        try {

            const queryParams: any = {
                limit: BATCH_SIZE,
                with_nested_markets: true,
                status: 'open' // Filter to open markets to improve relevance and speed
            };
            if (cursor) queryParams.cursor = cursor;

            const response = await axios.get(KALSHI_API_URL, { params: queryParams });
            const events = response.data.events || [];

            if (events.length === 0) break;

            allEvents = allEvents.concat(events);

            // Count markets in this batch for early termination
            if (targetMarketCount) {
                for (const event of events) {
                    totalMarketCount += (event.markets || []).length;
                }

                // Early termination: if we have enough markets, stop fetching
                if (totalMarketCount >= targetMarketCount * 2) {
                    break;
                }
            }

            cursor = response.data.cursor;
            page++;

        } catch (e) {
            console.error(`Error fetching Kalshi page ${page}:`, e);
            break;
        }
    } while (cursor && page < MAX_PAGES);


    return allEvents;
}

async function fetchSeriesMap(): Promise<Map<string, string[]>> {
    try {

        const response = await axios.get(KALSHI_SERIES_URL);
        const seriesList = response.data.series || [];
        const map = new Map<string, string[]>();
        for (const series of seriesList) {
            if (series.tags && series.tags.length > 0) {
                map.set(series.ticker, series.tags);
            }
        }

        return map;
    } catch (e) {
        console.error("Error fetching Kalshi series:", e);
        return new Map();
    }
}

export async function fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 50;

    try {
        // Fetch active events with nested markets
        // We also fetch Series metadata to get tags (tags are on Series, not Event)
        const [allEvents, seriesMap] = await Promise.all([
            fetchActiveEvents(limit),
            fetchSeriesMap()
        ]);

        // Extract ALL markets from all events
        const allMarkets: UnifiedMarket[] = [];

        for (const event of allEvents) {
            // Enrich event with tags from Series
            if (event.series_ticker && seriesMap.has(event.series_ticker)) {
                // If event has no tags or empty tags, use series tags
                if (!event.tags || event.tags.length === 0) {
                    event.tags = seriesMap.get(event.series_ticker);
                }
            }

            const markets = event.markets || [];
            for (const market of markets) {
                const unifiedMarket = mapMarketToUnified(event, market);
                if (unifiedMarket) {
                    allMarkets.push(unifiedMarket);
                }
            }
        }

        // Sort by 24h volume
        if (params?.sort === 'volume') {
            allMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'liquidity') {
            allMarkets.sort((a, b) => b.liquidity - a.liquidity);
        }

        return allMarkets.slice(0, limit);

    } catch (error) {
        console.error("Error fetching Kalshi data:", error);
        return [];
    }
}
