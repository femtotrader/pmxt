import { UnifiedMarket, UnifiedEvent, PriceCandle, CandleInterval, OrderBook, Trade, Order, Position, Balance, CreateOrderParams } from './types';
import { getExecutionPrice, getExecutionPriceDetailed, ExecutionPriceResult } from './utils/math';

export interface MarketFilterParams {
    limit?: number;
    offset?: number;
    sort?: 'volume' | 'liquidity' | 'newest';
    searchIn?: 'title' | 'description' | 'both'; // Where to search (default: 'title')
}

export interface HistoryFilterParams {
    resolution: CandleInterval;
    start?: Date;
    end?: Date;
    limit?: number;
}

// ----------------------------------------------------------------------------
// Filtering Types
// ----------------------------------------------------------------------------

export type MarketFilterCriteria = {
    // Text search
    text?: string;
    searchIn?: ('title' | 'description' | 'category' | 'tags' | 'outcomes')[]; // Default: ['title']

    // Numeric range filters
    volume24h?: { min?: number; max?: number };
    volume?: { min?: number; max?: number };
    liquidity?: { min?: number; max?: number };
    openInterest?: { min?: number; max?: number };

    // Date filters
    resolutionDate?: {
        before?: Date;
        after?: Date;
    };

    // Category/tag filters
    category?: string;
    tags?: string[]; // Match if market has ANY of these tags

    // Price filters (for binary markets)
    price?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number; // 0.0 to 1.0
        max?: number;
    };

    // Price change filters
    priceChange24h?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number; // e.g., -0.1 for 10% drop
        max?: number;
    };
};

export type MarketFilterFunction = (market: UnifiedMarket) => boolean;

export type EventFilterCriteria = {
    // Text search
    text?: string;
    searchIn?: ('title' | 'description' | 'category' | 'tags')[]; // Default: ['title']

    // Category/tag filters
    category?: string;
    tags?: string[];

    // Filter by contained markets
    marketCount?: { min?: number; max?: number };
    totalVolume?: { min?: number; max?: number }; // Sum of market volumes
};

export type EventFilterFunction = (event: UnifiedEvent) => boolean;

export interface ExchangeCredentials {
    // Standard API authentication (Kalshi, etc.)
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;

    // Blockchain-based authentication (Polymarket)
    privateKey?: string;  // Required for Polymarket L1 auth

    // Polymarket-specific L2 fields
    signatureType?: number | string;  // 0 = EOA, 1 = Poly Proxy, 2 = Gnosis Safe (Can also use 'eoa', 'polyproxy', 'gnosis_safe')
    funderAddress?: string;  // The address funding the trades (defaults to signer address)
}

// ----------------------------------------------------------------------------
// Base Exchange Class
// ----------------------------------------------------------------------------

export abstract class PredictionMarketExchange {
    protected credentials?: ExchangeCredentials;

    constructor(credentials?: ExchangeCredentials) {
        this.credentials = credentials;
    }

    abstract get name(): string;

    /**
     * Fetch all relevant markets from the source.
     */
    abstract fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]>;

    /**
     * Search for markets matching a keyword query.
     * By default, searches only in market titles. Use params.searchIn to search descriptions or both.
     */
    abstract searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]>;

    /**
     * Fetch markets by URL slug (Polymarket) or ticker (Kalshi).
     * @param slug - Market slug or ticker
     */
    abstract getMarketsBySlug(slug: string): Promise<UnifiedMarket[]>;

    /**
     * Search for events matching a keyword query.
     * Returns grouped events, each containing related markets.
     * @param query - Search term
     * @param params - Optional filter parameters
     */
    async searchEvents(query: string, params?: MarketFilterParams): Promise<UnifiedEvent[]> {
        throw new Error("Method searchEvents not implemented.");
    }

    /**
     * Fetch historical price data for a specific market outcome.
     * @param id - The Outcome ID (MarketOutcome.id). This should be the ID of the specific tradeable asset.
     */
    async fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        throw new Error("Method fetchOHLCV not implemented.");
    }

    /**
     * Fetch the current order book (bids/asks) for a specific outcome.
     * Essential for calculating localized spread and depth.
     */
    async fetchOrderBook(id: string): Promise<OrderBook> {
        throw new Error("Method fetchOrderBook not implemented.");
    }

    /**
     * Fetch raw trade history.
     */
    async fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        throw new Error("Method fetchTrades not implemented.");
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Place a new order.
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        throw new Error("Method createOrder not implemented.");
    }

    /**
     * Cancel an existing order.
     */
    async cancelOrder(orderId: string): Promise<Order> {
        throw new Error("Method cancelOrder not implemented.");
    }

    /**
     * Fetch a specific order by ID.
     */
    async fetchOrder(orderId: string): Promise<Order> {
        throw new Error("Method fetchOrder not implemented.");
    }

    /**
     * Fetch all open orders.
     * @param marketId - Optional filter by market.
     */
    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        throw new Error("Method fetchOpenOrders not implemented.");
    }

    /**
     * Fetch current user positions.
     */
    async fetchPositions(): Promise<Position[]> {
        throw new Error("Method fetchPositions not implemented.");
    }

    /**
     * Fetch account balances.
     */
    async fetchBalance(): Promise<Balance[]> {
        throw new Error("Method fetchBalance not implemented.");
    }

    getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number {
        return getExecutionPrice(orderBook, side, amount);
    }

    getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): ExecutionPriceResult {
        return getExecutionPriceDetailed(orderBook, side, amount);
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter markets based on criteria or custom function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of markets
     *
     * @example Simple text search
     * api.filterMarkets(markets, 'Trump')
     *
     * @example Advanced filtering
     * api.filterMarkets(markets, {
     *   text: 'Trump',
     *   searchIn: ['title', 'tags'],
     *   volume24h: { min: 10000 },
     *   category: 'Politics',
     *   price: { outcome: 'yes', max: 0.5 }
     * })
     *
     * @example Custom predicate
     * api.filterMarkets(markets, m => m.liquidity > 5000 && m.yes?.price < 0.3)
     */
    filterMarkets(
        markets: UnifiedMarket[],
        criteria: string | MarketFilterCriteria | MarketFilterFunction
    ): UnifiedMarket[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return markets.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return markets.filter(m =>
                m.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return markets.filter(market => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && market.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && market.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && market.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && market.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'outcomes' && market.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && market.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    market.tags?.some(marketTag =>
                        marketTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Volume24h filter
            if (criteria.volume24h) {
                if (criteria.volume24h.min !== undefined && market.volume24h < criteria.volume24h.min) {
                    return false;
                }
                if (criteria.volume24h.max !== undefined && market.volume24h > criteria.volume24h.max) {
                    return false;
                }
            }

            // Volume filter
            if (criteria.volume) {
                if (criteria.volume.min !== undefined && (market.volume || 0) < criteria.volume.min) {
                    return false;
                }
                if (criteria.volume.max !== undefined && (market.volume || 0) > criteria.volume.max) {
                    return false;
                }
            }

            // Liquidity filter
            if (criteria.liquidity) {
                if (criteria.liquidity.min !== undefined && market.liquidity < criteria.liquidity.min) {
                    return false;
                }
                if (criteria.liquidity.max !== undefined && market.liquidity > criteria.liquidity.max) {
                    return false;
                }
            }

            // OpenInterest filter
            if (criteria.openInterest) {
                if (criteria.openInterest.min !== undefined && (market.openInterest || 0) < criteria.openInterest.min) {
                    return false;
                }
                if (criteria.openInterest.max !== undefined && (market.openInterest || 0) > criteria.openInterest.max) {
                    return false;
                }
            }

            // ResolutionDate filter
            if (criteria.resolutionDate) {
                const resDate = market.resolutionDate;
                if (criteria.resolutionDate.before && resDate >= criteria.resolutionDate.before) {
                    return false;
                }
                if (criteria.resolutionDate.after && resDate <= criteria.resolutionDate.after) {
                    return false;
                }
            }

            // Price filter (for binary markets)
            if (criteria.price) {
                const outcome = market[criteria.price.outcome];
                if (!outcome) return false;

                if (criteria.price.min !== undefined && outcome.price < criteria.price.min) {
                    return false;
                }
                if (criteria.price.max !== undefined && outcome.price > criteria.price.max) {
                    return false;
                }
            }

            // Price change filter
            if (criteria.priceChange24h) {
                const outcome = market[criteria.priceChange24h.outcome];
                if (!outcome || outcome.priceChange24h === undefined) return false;

                if (criteria.priceChange24h.min !== undefined && outcome.priceChange24h < criteria.priceChange24h.min) {
                    return false;
                }
                if (criteria.priceChange24h.max !== undefined && outcome.priceChange24h > criteria.priceChange24h.max) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Filter events based on criteria or custom function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of events
     *
     * @example Simple text search
     * api.filterEvents(events, 'Trump')
     *
     * @example Advanced filtering
     * api.filterEvents(events, {
     *   text: 'Election',
     *   searchIn: ['title', 'tags'],
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * })
     *
     * @example Custom predicate
     * api.filterEvents(events, e => e.markets.length > 10)
     */
    filterEvents(
        events: UnifiedEvent[],
        criteria: string | EventFilterCriteria | EventFilterFunction
    ): UnifiedEvent[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return events.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return events.filter(e =>
                e.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return events.filter(event => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && event.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && event.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && event.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && event.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && event.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    event.tags?.some(eventTag =>
                        eventTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Market count filter
            if (criteria.marketCount) {
                const count = event.markets.length;
                if (criteria.marketCount.min !== undefined && count < criteria.marketCount.min) {
                    return false;
                }
                if (criteria.marketCount.max !== undefined && count > criteria.marketCount.max) {
                    return false;
                }
            }

            // Total volume filter
            if (criteria.totalVolume) {
                const totalVolume = event.markets.reduce((sum, m) => sum + m.volume24h, 0);
                if (criteria.totalVolume.min !== undefined && totalVolume < criteria.totalVolume.min) {
                    return false;
                }
                if (criteria.totalVolume.max !== undefined && totalVolume > criteria.totalVolume.max) {
                    return false;
                }
            }

            return true;
        });
    }

    // ----------------------------------------------------------------------------
    // WebSocket Streaming Methods
    // ----------------------------------------------------------------------------

    /**
     * Watch orderbook updates in real-time via WebSocket.
     * Returns a promise that resolves with the latest orderbook state.
     * The orderbook is maintained internally with incremental updates.
     * 
     * Usage (async iterator pattern):
     * ```typescript
     * while (true) {
     *     const orderbook = await exchange.watchOrderBook(outcomeId);
     *     console.log(orderbook);
     * }
     * ```
     * 
     * @param id - The Outcome ID to watch
     * @param limit - Optional limit for orderbook depth
     * @returns Promise that resolves with the current orderbook state
     */
    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        throw new Error(`watchOrderBook() is not supported by ${this.name}`);
    }

    /**
     * Watch trade executions in real-time via WebSocket.
     * Returns a promise that resolves with an array of recent trades.
     * 
     * Usage (async iterator pattern):
     * ```typescript
     * while (true) {
     *     const trades = await exchange.watchTrades(outcomeId);
     *     console.log(trades);
     * }
     * ```
     * 
     * @param id - The Outcome ID to watch
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Promise that resolves with recent trades
     */
    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        throw new Error(`watchTrades() is not supported by ${this.name}`);
    }

    /**
     * Close all WebSocket connections and clean up resources.
     * Should be called when done with real-time data to prevent memory leaks.
     * 
     * Usage:
     * ```typescript
     * await exchange.close();
     * ```
     */
    async close(): Promise<void> {
        // Default implementation: no-op
        // Exchanges with WebSocket support should override this
    }
}
