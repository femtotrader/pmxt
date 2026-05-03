/**
 * @license
 * Polymarket WebSocket implementation for pmxt.
 *
 * NOTICE: This implementation depends on "@nevuamarkets/poly-websockets",
 * which is licensed under the MIT License.
 */

import { SubscribedAddressSnapshot, SubscriptionOption } from '../../subscriber/base';
import {
    buildPolymarketActivity,
    GoldSkySubscriber,
    POLYMARKET_DEFAULT_SUBSCRIPTION,
} from '../../subscriber/external/goldsky';
import { AddressWatcher, WatcherConfig } from '../../subscriber/watcher';
import { OrderBook, OrderLevel, QueuedPromise, Trade } from '../../types';
import { DEFAULT_WATCH_TIMEOUT_MS, withWatchTimeout } from '../../utils/watch-timeout';


export interface PolymarketWebSocketConfig {
    /** Reconnection check interval in milliseconds (default: 5000) */
    reconnectIntervalMs?: number;
    /** Pending subscription flush interval in milliseconds (default: 100) */
    flushIntervalMs?: number;
    /** Watcher subscription configurations */
    watcherConfig?: WatcherConfig;
    /** Timeout in ms for watch methods to receive data (default: 30000). 0 = no timeout. */
    watchTimeoutMs?: number;
}

/**
 * Wrapper around @nevuamarkets/poly-websockets that provides CCXT Pro-style
 * watchOrderBook() and watchTrades() methods.
 */
export class PolymarketWebSocket {
    private manager: any;
    private readonly watcher: AddressWatcher;
    private orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
    private tradeResolvers = new Map<string, QueuedPromise<Trade[]>[]>();
    private orderBooks = new Map<string, OrderBook>();
    private config: PolymarketWebSocketConfig;
    private initializationPromise?: Promise<void>;

    constructor(callApi: (operationId: string, params?: Record<string, any>) => Promise<any>, config: PolymarketWebSocketConfig = {}) {
        this.config = config;
        const watcherConfig = this.config.watcherConfig;
        const subscriber = new GoldSkySubscriber({
            ...watcherConfig,
            buildSubscription: POLYMARKET_DEFAULT_SUBSCRIPTION,
        });
        this.watcher = new AddressWatcher(
            (address, types) => callApi('fetchWatchedAddressActivity', { address, types }),
            {
                subscriber,
                buildActivity: buildPolymarketActivity,
            },
        );
    }

    async watchOrderBook(id: string): Promise<OrderBook> {
        await this.ensureInitialized();

        // Subscribe to the asset if not already subscribed
        const currentAssets = this.manager.getAssetIds();
        if (!currentAssets.includes(id)) {
            await this.manager.addSubscriptions([id]);
        }

        // Return a promise that resolves on the next orderbook update
        const dataPromise = new Promise<OrderBook>((resolve, reject) => {
            if (!this.orderBookResolvers.has(id)) {
                this.orderBookResolvers.set(id, []);
            }
            this.orderBookResolvers.get(id)!.push({ resolve, reject });
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchOrderBook('${id}')`,
        );
    }

    async unwatchOrderBook(id: string): Promise<void> {
        if (!this.manager) {
            return;
        }

        await this.manager.removeSubscriptions([id]);

        // Clear any pending resolvers for this asset
        const resolvers = this.orderBookResolvers.get(id);
        if (resolvers) {
            this.orderBookResolvers = new Map(
                [...this.orderBookResolvers].filter(([key]) => key !== id),
            );
        }

        // Remove the cached orderbook for this asset
        if (this.orderBooks.has(id)) {
            this.orderBooks = new Map(
                [...this.orderBooks].filter(([key]) => key !== id),
            );
        }
    }

    async watchTrades(id: string, address?: string): Promise<Trade[]> {
        if (address) {
            return this.watcher.watch(address, ['trades'], id);
        }

        await this.ensureInitialized();

        // Subscribe to the asset if not already subscribed
        const currentAssets = this.manager.getAssetIds();
        if (!currentAssets.includes(id)) {
            await this.manager.addSubscriptions([id]);
        }

        // Return a promise that resolves on the next trade
        const dataPromise = new Promise<Trade[]>((resolve, reject) => {
            if (!this.tradeResolvers.has(id)) {
                this.tradeResolvers.set(id, []);
            }
            this.tradeResolvers.get(id)!.push({ resolve, reject });
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchTrades('${id}')`,
        );
    }

    async watchAddress(address: string, types: SubscriptionOption[]): Promise<SubscribedAddressSnapshot> {
        return this.watcher.watch(address, types);
    }

    async unwatchAddress(address: string): Promise<void> {
        return this.watcher.unwatch(address);
    }

    async close() {
        if (this.manager) {
            await this.manager.clearState();
        }
        this.watcher.close();
    }

    private async ensureInitialized() {
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            try {
                // Dynamic import to handle optional dependency
                const poly = await import('@nevuamarkets/poly-websockets');

                this.manager = new poly.WSSubscriptionManager(
                    {
                        onBook: async (events: any[]) => {
                            for (const event of events) {
                                this.handleBookSnapshot(event);
                            }
                        },
                        onPriceChange: async (events: any[]) => {
                            for (const event of events) {
                                this.handlePriceChange(event);
                            }
                        },
                        onLastTradePrice: async (events: any[]) => {
                            for (const event of events) {
                                this.handleTrade(event);
                            }
                        },
                        onError: async (error: Error) => {
                            console.error('Polymarket WebSocket error:', error.message);
                        },
                    },
                    {
                        reconnectAndCleanupIntervalMs: this.config.reconnectIntervalMs ?? 5000,
                        pendingFlushIntervalMs: this.config.flushIntervalMs ?? 100,
                    },
                );
            } catch (e) {
                const error = e as Error;
                if (error.message.includes('Cannot find module')) {
                    throw new Error(
                        'Polymarket WebSocket support requires the "@nevuamarkets/poly-websockets" package.\n' +
                        'To use this feature, please install it: npm install @nevuamarkets/poly-websockets',
                    );
                }
                throw e;
            }
        })();

        return this.initializationPromise;
    }

    private handleBookSnapshot(event: any) {
        const id = event.asset_id;

        const bids: OrderLevel[] = event.bids.map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
        })).sort((a: any, b: any) => b.price - a.price);

        const asks: OrderLevel[] = event.asks.map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
        })).sort((a: any, b: any) => a.price - b.price);

        const orderBook: OrderBook = {
            bids,
            asks,
            timestamp: event.timestamp ? (isNaN(Number(event.timestamp)) ? new Date(event.timestamp).getTime() : Number(event.timestamp)) : Date.now(),
        };

        this.orderBooks.set(id, orderBook);
        this.resolveOrderBook(id, orderBook);
    }

    private handlePriceChange(event: any) {
        // Apply deltas to existing orderbook
        for (const change of event.price_changes) {
            const id = change.asset_id;
            const existing = this.orderBooks.get(id);

            if (!existing) {
                // No snapshot yet, skip delta
                continue;
            }

            const price = parseFloat(change.price);
            const size = parseFloat(change.size);
            const side = change.side.toUpperCase();

            const levels = side === 'BUY' ? existing.bids : existing.asks;
            const existingIndex = levels.findIndex((l) => l.price === price);

            if (size === 0) {
                // Remove level
                if (existingIndex !== -1) {
                    levels.splice(existingIndex, 1);
                }
            } else {
                // Update or add level
                if (existingIndex !== -1) {
                    levels[existingIndex].size = size;
                } else {
                    levels.push({ price, size });
                    // Re-sort
                    if (side === 'BUY') {
                        levels.sort((a, b) => b.price - a.price);
                    } else {
                        levels.sort((a, b) => a.price - b.price);
                    }
                }
            }

            existing.timestamp = event.timestamp ? (isNaN(Number(event.timestamp)) ? new Date(event.timestamp).getTime() : Number(event.timestamp)) : Date.now();
            this.resolveOrderBook(id, existing);
        }
    }

    private handleTrade(event: any) {
        const id = event.asset_id;

        const trade: Trade = {
            id: `${event.timestamp}-${Math.random()}`,
            timestamp: event.timestamp ? (isNaN(Number(event.timestamp)) ? new Date(event.timestamp).getTime() : Number(event.timestamp)) : Date.now(),
            price: parseFloat(event.price),
            amount: parseFloat(event.size),
            side: event.side.toLowerCase() as 'buy' | 'sell' | 'unknown',
        };

        const resolvers = this.tradeResolvers.get(id);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach((r) => r.resolve([trade]));
            this.tradeResolvers.set(id, []);
        }
    }

    private resolveOrderBook(id: string, orderBook: OrderBook) {
        const resolvers = this.orderBookResolvers.get(id);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach((r) => r.resolve(orderBook));
            this.orderBookResolvers.set(id, []);
        }
    }
}
