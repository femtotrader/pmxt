import { UnifiedMarket, UnifiedEvent, PriceCandle, CandleInterval, OrderBook, Trade, Order, Position, Balance, CreateOrderParams } from './types';
import { getExecutionPrice, getExecutionPriceDetailed, ExecutionPriceResult } from './utils/math';

export interface MarketFilterParams {
    limit?: number;
    offset?: number;
    sort?: 'volume' | 'liquidity' | 'newest';
    searchIn?: 'title' | 'description' | 'both'; // Where to search (default: 'title')
    query?: string;  // For keyword search
    slug?: string;   // For slug/ticker lookup
    page?: number;   // For pagination (used by Limitless)
    similarityThreshold?: number; // For semantic search (used by Limitless)
}

export interface MarketFetchParams extends MarketFilterParams { }

export interface EventFetchParams {
    query?: string;  // For keyword search (will be required in practice)
    limit?: number;
    offset?: number;
    searchIn?: 'title' | 'description' | 'both';
}

export interface HistoryFilterParams {
    resolution?: CandleInterval; // Optional for backward compatibility
    start?: Date;
    end?: Date;
    limit?: number;
}

export interface OHLCVParams {
    resolution: CandleInterval; // Required for candle aggregation
    start?: Date;
    end?: Date;
    limit?: number;
}

export interface TradesParams {
    // No resolution - trades are discrete events, not aggregated
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
     * Fetch markets with optional filtering, search, or slug lookup.
     * This is the primary method for retrieving markets.
     *
     * @param params - Optional parameters for filtering and search
     * @param params.query - Search keyword to filter markets
     * @param params.slug - Market slug/ticker for direct lookup
     * @param params.limit - Maximum number of results
     * @param params.offset - Pagination offset
     * @param params.sort - Sort order ('volume' | 'liquidity' | 'newest')
     * @param params.searchIn - Where to search ('title' | 'description' | 'both')
     * @returns Array of unified markets
     *
     * @example-ts Fetch markets
     * const markets = await exchange.fetchMarkets({ query: 'Trump', limit: 20 });
     * console.log(markets[0].title);
     *
     * @example-ts Get market by slug
     * const markets = await exchange.fetchMarkets({ slug: 'will-trump-win' });
     *
     * @example-python Fetch markets
     * markets = exchange.fetch_markets(query='Trump', limit=20)
     * print(markets[0].title)
     *
     * @example-python Get market by slug
     * markets = exchange.fetch_markets(slug='will-trump-win')
     */
    async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return this.fetchMarketsImpl(params);
    }

    /**
     * Fetch events with optional keyword search.
     * Events group related markets together (e.g., "Who will be Fed Chair?" contains multiple candidate markets).
     *
     * @param params - Optional parameters for search and filtering
     * @param params.query - Search keyword to filter events (required)
     * @param params.limit - Maximum number of results
     * @param params.offset - Pagination offset
     * @param params.searchIn - Where to search ('title' | 'description' | 'both')
     * @returns Array of unified events
     *
     * @example-ts Search events
     * const events = await exchange.fetchEvents({ query: 'Fed Chair' });
     * const fedEvent = events[0];
     * console.log(fedEvent.title, fedEvent.markets.length, 'markets');
     *
     * @example-python Search events
     * events = exchange.fetch_events(query='Fed Chair')
     * fed_event = events[0]
     * print(fed_event.title, len(fed_event.markets), 'markets')
     */
    async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        if (!params?.query) {
            throw new Error("fetchEvents() requires a query parameter");
        }
        return this.fetchEventsImpl(params);
    }

    // ----------------------------------------------------------------------------
    // Implementation methods (to be overridden by exchanges)
    // ----------------------------------------------------------------------------

    /**
     * @internal
     * Implementation for fetching/searching markets.
     * Exchanges should handle query, slug, and plain fetch cases based on params.
     */
    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        throw new Error("Method fetchMarketsImpl not implemented.");
    }

    /**
     * @internal
     * Implementation for searching events by keyword.
     */
    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        throw new Error("Method fetchEventsImpl not implemented.");
    }

    /**
     * Fetch historical OHLCV (candlestick) price data for a specific market outcome.
     *
     * @param id - The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
     * @param params - OHLCV parameters including resolution (required)
     * @returns Array of price candles
     *
     * @example-ts Fetch hourly candles
     * const markets = await exchange.fetchMarkets({ query: 'Trump' });
     * const outcomeId = markets[0].yes.outcomeId;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: '1h',
     *   limit: 100
     * });
     * console.log(`Latest close: ${candles[candles.length - 1].close}`);
     *
     * @example-python Fetch hourly candles
     * markets = exchange.fetch_markets(query='Trump')
     * outcome_id = markets[0].yes.outcome_id
     * candles = exchange.fetch_ohlcv(outcome_id, resolution='1h', limit=100)
     * print(f"Latest close: {candles[-1].close}")
     *
     * @notes **CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
     * @notes Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
     * @notes Resolution options: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'
     */
    async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]> {
        throw new Error("Method fetchOHLCV not implemented.");
    }

    /**
     * Fetch the current order book (bids/asks) for a specific outcome.
     * Essential for calculating spread, depth, and execution prices.
     *
     * @param id - The Outcome ID (outcomeId)
     * @returns Current order book with bids and asks
     *
     * @example-ts Fetch order book
     * const book = await exchange.fetchOrderBook(outcome.outcomeId);
     * console.log(`Best bid: ${book.bids[0].price}`);
     * console.log(`Best ask: ${book.asks[0].price}`);
     * console.log(`Spread: ${(book.asks[0].price - book.bids[0].price) * 100}%`);
     *
     * @example-python Fetch order book
     * book = exchange.fetch_order_book(outcome.outcome_id)
     * print(f"Best bid: {book.bids[0].price}")
     * print(f"Best ask: {book.asks[0].price}")
     * print(f"Spread: {(book.asks[0].price - book.bids[0].price) * 100:.2f}%")
     */
    async fetchOrderBook(id: string): Promise<OrderBook> {
        throw new Error("Method fetchOrderBook not implemented.");
    }

    /**
     * Fetch raw trade history for a specific outcome.
     *
     * @param id - The Outcome ID (outcomeId)
     * @param params - Trade filter parameters
     * @returns Array of recent trades
     *
     * @example-ts Fetch recent trades
     * const trades = await exchange.fetchTrades(outcome.outcomeId, { limit: 100 });
     * for (const trade of trades) {
     *   console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
     * }
     *
     * @example-python Fetch recent trades
     * trades = exchange.fetch_trades(outcome.outcome_id, limit=100)
     * for trade in trades:
     *     print(f"{trade.side} {trade.amount} @ {trade.price}")
     *
     * @notes Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.
     */
    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        // Deprecation warning for resolution parameter
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }
        throw new Error("Method fetchTrades not implemented.");
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Place a new order on the exchange.
     *
     * @param params - Order parameters
     * @returns The created order
     *
     * @example-ts Place a limit order
     * const order = await exchange.createOrder({
     *   marketId: market.marketId,
     *   outcomeId: market.yes.outcomeId,
     *   side: 'buy',
     *   type: 'limit',
     *   amount: 10,
     *   price: 0.55
     * });
     * console.log(`Order ${order.id}: ${order.status}`);
     *
     * @example-ts Place a market order
     * const order = await exchange.createOrder({
     *   marketId: market.marketId,
     *   outcomeId: market.yes.outcomeId,
     *   side: 'buy',
     *   type: 'market',
     *   amount: 5
     * });
     *
     * @example-python Place a limit order
     * order = exchange.create_order(
     *     market_id=market.market_id,
     *     outcome_id=market.yes.outcome_id,
     *     side='buy',
     *     type='limit',
     *     amount=10,
     *     price=0.55
     * )
     * print(f"Order {order.id}: {order.status}")
     *
     * @example-python Place a market order
     * order = exchange.create_order(
     *     market_id=market.market_id,
     *     outcome_id=market.yes.outcome_id,
     *     side='buy',
     *     type='market',
     *     amount=5
     * )
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        throw new Error("Method createOrder not implemented.");
    }

    /**
     * Cancel an existing open order.
     *
     * @param orderId - The order ID to cancel
     * @returns The cancelled order
     *
     * @example-ts Cancel an order
     * const cancelled = await exchange.cancelOrder('order-123');
     * console.log(cancelled.status); // 'cancelled'
     *
     * @example-python Cancel an order
     * cancelled = exchange.cancel_order('order-123')
     * print(cancelled.status)  # 'cancelled'
     */
    async cancelOrder(orderId: string): Promise<Order> {
        throw new Error("Method cancelOrder not implemented.");
    }

    /**
     * Fetch a specific order by ID.
     *
     * @param orderId - The order ID to look up
     * @returns The order details
     *
     * @example-ts Fetch order status
     * const order = await exchange.fetchOrder('order-456');
     * console.log(`Filled: ${order.filled}/${order.amount}`);
     *
     * @example-python Fetch order status
     * order = exchange.fetch_order('order-456')
     * print(f"Filled: {order.filled}/{order.amount}")
     */
    async fetchOrder(orderId: string): Promise<Order> {
        throw new Error("Method fetchOrder not implemented.");
    }

    /**
     * Fetch all open orders, optionally filtered by market.
     *
     * @param marketId - Optional market ID to filter by
     * @returns Array of open orders
     *
     * @example-ts Fetch all open orders
     * const orders = await exchange.fetchOpenOrders();
     * for (const order of orders) {
     *   console.log(`${order.side} ${order.amount} @ ${order.price}`);
     * }
     *
     * @example-ts Fetch orders for a specific market
     * const orders = await exchange.fetchOpenOrders('FED-25JAN');
     *
     * @example-python Fetch all open orders
     * orders = exchange.fetch_open_orders()
     * for order in orders:
     *     print(f"{order.side} {order.amount} @ {order.price}")
     *
     * @example-python Fetch orders for a specific market
     * orders = exchange.fetch_open_orders('FED-25JAN')
     */
    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        throw new Error("Method fetchOpenOrders not implemented.");
    }

    /**
     * Fetch current user positions across all markets.
     *
     * @returns Array of user positions
     *
     * @example-ts Fetch positions
     * const positions = await exchange.fetchPositions();
     * for (const pos of positions) {
     *   console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
     *   console.log(`Unrealized P&L: $${pos.unrealizedPnL.toFixed(2)}`);
     * }
     *
     * @example-python Fetch positions
     * positions = exchange.fetch_positions()
     * for pos in positions:
     *     print(f"{pos.outcome_label}: {pos.size} @ ${pos.entry_price}")
     *     print(f"Unrealized P&L: ${pos.unrealized_pnl:.2f}")
     */
    async fetchPositions(): Promise<Position[]> {
        throw new Error("Method fetchPositions not implemented.");
    }

    /**
     * Fetch account balances.
     *
     * @returns Array of account balances
     *
     * @example-ts Fetch balance
     * const balances = await exchange.fetchBalance();
     * console.log(`Available: $${balances[0].available}`);
     *
     * @example-python Fetch balance
     * balances = exchange.fetch_balance()
     * print(f"Available: ${balances[0].available}")
     */
    async fetchBalance(): Promise<Balance[]> {
        throw new Error("Method fetchBalance not implemented.");
    }

    /**
     * Calculate the volume-weighted average execution price for a given order size.
     * Returns 0 if the order cannot be fully filled.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - Number of contracts to simulate
     * @returns Average execution price, or 0 if insufficient liquidity
     *
     * @example-ts Get execution price
     * const book = await exchange.fetchOrderBook(outcome.outcomeId);
     * const price = exchange.getExecutionPrice(book, 'buy', 100);
     * console.log(`Avg price for 100 contracts: ${price}`);
     *
     * @example-python Get execution price
     * book = exchange.fetch_order_book(outcome.outcome_id)
     * price = exchange.get_execution_price(book, 'buy', 100)
     * print(f"Avg price for 100 contracts: {price}")
     */
    getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number {
        return getExecutionPrice(orderBook, side, amount);
    }

    /**
     * Calculate detailed execution price information including partial fill data.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - Number of contracts to simulate
     * @returns Detailed execution result with price, filled amount, and fill status
     *
     * @example-ts Get detailed execution price
     * const book = await exchange.fetchOrderBook(outcome.outcomeId);
     * const result = exchange.getExecutionPriceDetailed(book, 'buy', 100);
     * console.log(`Price: ${result.price}`);
     * console.log(`Filled: ${result.filledAmount}/${100}`);
     * console.log(`Fully filled: ${result.fullyFilled}`);
     *
     * @example-python Get detailed execution price
     * book = exchange.fetch_order_book(outcome.outcome_id)
     * result = exchange.get_execution_price_detailed(book, 'buy', 100)
     * print(f"Price: {result.price}")
     * print(f"Filled: {result.filled_amount}/100")
     * print(f"Fully filled: {result.fully_filled}")
     */
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
     * Filter a list of markets by criteria.
     * Can filter by string query, structured criteria object, or custom filter function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria: string (text search), object (structured), or function (predicate)
     * @returns Filtered array of markets
     *
     * @example-ts Simple text search
     * const filtered = exchange.filterMarkets(markets, 'Trump');
     *
     * @example-ts Advanced criteria
     * const undervalued = exchange.filterMarkets(markets, {
     *   text: 'Election',
     *   volume24h: { min: 10000 },
     *   price: { outcome: 'yes', max: 0.4 }
     * });
     *
     * @example-ts Custom predicate
     * const volatile = exchange.filterMarkets(markets,
     *   m => m.yes?.priceChange24h < -0.1
     * );
     *
     * @example-python Simple text search
     * filtered = exchange.filter_markets(markets, 'Trump')
     *
     * @example-python Advanced criteria
     * undervalued = exchange.filter_markets(markets, {
     *     'text': 'Election',
     *     'volume_24h': {'min': 10000},
     *     'price': {'outcome': 'yes', 'max': 0.4}
     * })
     *
     * @example-python Custom predicate
     * volatile = exchange.filter_markets(markets,
     *     lambda m: m.yes and m.yes.price_change_24h < -0.1
     * )
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
     * Filter a list of events by criteria.
     * Can filter by string query, structured criteria object, or custom filter function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria: string (text search), object (structured), or function (predicate)
     * @returns Filtered array of events
     *
     * @example-ts Filter by category
     * const filtered = exchange.filterEvents(events, {
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * });
     *
     * @example-python Filter by category
     * filtered = exchange.filter_events(events, {
     *     'category': 'Politics',
     *     'market_count': {'min': 5}
     * })
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
     * Watch order book updates in real-time via WebSocket.
     * Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param id - The Outcome ID to watch
     * @param limit - Optional limit for orderbook depth
     * @returns Promise that resolves with the current orderbook state
     *
     * @example-ts Stream order book
     * while (true) {
     *   const book = await exchange.watchOrderBook(outcome.outcomeId);
     *   console.log(`Bid: ${book.bids[0]?.price} Ask: ${book.asks[0]?.price}`);
     * }
     *
     * @example-python Stream order book
     * while True:
     *     book = exchange.watch_order_book(outcome.outcome_id)
     *     print(f"Bid: {book.bids[0].price} Ask: {book.asks[0].price}")
     */
    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        throw new Error(`watchOrderBook() is not supported by ${this.name}`);
    }

    /**
     * Watch trade executions in real-time via WebSocket.
     * Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param id - The Outcome ID to watch
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Promise that resolves with recent trades
     *
     * @example-ts Stream trades
     * while (true) {
     *   const trades = await exchange.watchTrades(outcome.outcomeId);
     *   for (const trade of trades) {
     *     console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
     *   }
     * }
     *
     * @example-python Stream trades
     * while True:
     *     trades = exchange.watch_trades(outcome.outcome_id)
     *     for trade in trades:
     *         print(f"{trade.side} {trade.amount} @ {trade.price}")
     */
    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        throw new Error(`watchTrades() is not supported by ${this.name}`);
    }

    /**
     * Close all WebSocket connections and clean up resources.
     * Call this when you're done streaming to properly release connections.
     *
     * @example-ts Close connections
     * await exchange.close();
     *
     * @example-python Close connections
     * exchange.close()
     */
    async close(): Promise<void> {
        // Default implementation: no-op
        // Exchanges with WebSocket support should override this
    }
}
