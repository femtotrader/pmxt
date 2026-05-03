import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks – must be declared before imports that depend on them
// ---------------------------------------------------------------------------

jest.mock('ws', () => {
    const MockWS = jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        once: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        readyState: 1,
        OPEN: 1,
        CLOSED: 3,
        CLOSING: 2,
    }));
    // Static constants used in close() readyState checks
    (MockWS as any).CLOSED = 3;
    (MockWS as any).CLOSING = 2;
    (MockWS as any).OPEN = 1;
    return { default: MockWS, __esModule: true };
});

jest.mock('../../src/exchanges/kalshi/auth', () => ({
    KalshiAuth: jest.fn().mockImplementation(() => ({
        getHeaders: jest.fn().mockReturnValue({ 'kalshi-access-key': 'test-key' }),
    })),
}));

import { KalshiWebSocket } from '../../src/exchanges/kalshi/websocket';
import { MyriadWebSocket } from '../../src/exchanges/myriad/websocket';
import { KalshiAuth } from '../../src/exchanges/kalshi/auth';
import type { OrderBook, Trade } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createKalshiWS(overrides: Record<string, any> = {}): KalshiWebSocket {
    const auth = new KalshiAuth({ apiKey: 'k', privateKey: 'pk' } as any);
    return new KalshiWebSocket(auth, {
        wsUrl: 'wss://fake.kalshi.com/trade-api/ws/v2',
        reconnectIntervalMs: 100,
        ...overrides,
    });
}

/** Directly invoke a private method on the KalshiWebSocket instance. */
function call(ws: any, method: string, ...args: any[]) {
    return ws[method](...args);
}

/** Read a private field */
function field(ws: any, name: string) {
    return ws[name];
}

/** Set a private field */
function setField(ws: any, name: string, value: any) {
    ws[name] = value;
}

// ---------------------------------------------------------------------------
// Kalshi WebSocket Tests
// ---------------------------------------------------------------------------

describe('KalshiWebSocket', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // --- Order Book Snapshot -------------------------------------------

    describe('handleOrderbookSnapshot', () => {
        test('builds correct OrderBook from Kalshi yes/no cent format', () => {
            const ws = createKalshiWS();

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-A',
                yes: [
                    { price: 65, quantity: 100 },
                    { price: 60, quantity: 50 },
                ],
                no: [
                    { price: 35, quantity: 80 },
                    { price: 40, quantity: 20 },
                ],
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-A');
            expect(book).toBeDefined();

            // yes → bids, sorted desc by price
            expect(book.bids).toHaveLength(2);
            expect(book.bids[0].price).toBeCloseTo(0.65);
            expect(book.bids[0].size).toBe(100);
            expect(book.bids[1].price).toBeCloseTo(0.60);
            expect(book.bids[1].size).toBe(50);

            // no → asks, price = (100 - no_price) / 100, sorted asc
            expect(book.asks).toHaveLength(2);
            expect(book.asks[0].price).toBeCloseTo(0.60);
            expect(book.asks[0].size).toBe(20);
            expect(book.asks[1].price).toBeCloseTo(0.65);
            expect(book.asks[1].size).toBe(80);
        });

        test('handles array-style price levels [price, size]', () => {
            const ws = createKalshiWS();

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-B',
                yes: [[70, 30]],
                no: [[30, 15]],
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-B');
            expect(book.bids[0].price).toBeCloseTo(0.70);
            expect(book.bids[0].size).toBe(30);
            expect(book.asks[0].price).toBeCloseTo(0.70);
            expect(book.asks[0].size).toBe(15);
        });

        test('resolves pending orderbook promises', () => {
            const ws = createKalshiWS();

            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'orderBookResolvers').set('MKT-C', [resolver]);

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-C',
                yes: [{ price: 50, quantity: 10 }],
                no: [],
            });

            expect(resolver.resolve).toHaveBeenCalledTimes(1);
            const resolved = (resolver.resolve as jest.Mock).mock.calls[0][0] as OrderBook;
            expect(resolved.bids[0].price).toBeCloseTo(0.50);
        });

        test('clears resolver queue after resolution', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'orderBookResolvers').set('MKT-D', [resolver]);

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-D',
                yes: [],
                no: [],
            });

            expect(field(ws, 'orderBookResolvers').get('MKT-D')).toEqual([]);
        });
    });

    // --- Order Book Delta ----------------------------------------------

    describe('handleOrderbookDelta', () => {
        function snapshotFirst(ws: any, ticker: string) {
            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: ticker,
                yes: [{ price: 65, quantity: 100 }],
                no: [{ price: 40, quantity: 50 }],
            });
        }

        test('applies incremental update to cached book (yes side)', () => {
            const ws = createKalshiWS();
            snapshotFirst(ws, 'MKT-E');

            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'MKT-E',
                price: 65,
                delta: 20,
                side: 'yes',
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-E');
            // 100 + 20 = 120
            expect(book.bids[0].size).toBe(120);
        });

        test('applies incremental update to cached book (no side)', () => {
            const ws = createKalshiWS();
            snapshotFirst(ws, 'MKT-F');

            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'MKT-F',
                price: 40,
                delta: 10,
                side: 'no',
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-F');
            // asks: original was (100-40)/100 = 0.60, size 50 → 50+10 = 60
            expect(book.asks[0].size).toBe(60);
        });

        test('ignores delta when no snapshot exists', () => {
            const ws = createKalshiWS();

            // Should not throw
            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'NO-SNAP',
                price: 50,
                delta: 10,
                side: 'yes',
            });

            expect(field(ws, 'orderBooks').has('NO-SNAP')).toBe(false);
        });

        test('removes level when delta is 0', () => {
            const ws = createKalshiWS();
            snapshotFirst(ws, 'MKT-G');

            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'MKT-G',
                price: 65,
                delta: 0,
                side: 'yes',
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-G');
            expect(book.bids).toHaveLength(0);
        });

        test('removes level when cumulative delta goes to zero or below', () => {
            const ws = createKalshiWS();
            snapshotFirst(ws, 'MKT-H');

            // Original size = 100, apply -100
            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'MKT-H',
                price: 65,
                delta: -100,
                side: 'yes',
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-H');
            expect(book.bids).toHaveLength(0);
        });

        test('adds new price level and re-sorts', () => {
            const ws = createKalshiWS();
            snapshotFirst(ws, 'MKT-I');

            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'MKT-I',
                price: 70,
                delta: 30,
                side: 'yes',
            });

            const book: OrderBook = field(ws, 'orderBooks').get('MKT-I');
            // Bids sorted desc: 0.70 first, then 0.65
            expect(book.bids).toHaveLength(2);
            expect(book.bids[0].price).toBeCloseTo(0.70);
            expect(book.bids[1].price).toBeCloseTo(0.65);
        });

        test('resolves pending orderbook promises after delta', () => {
            const ws = createKalshiWS();
            snapshotFirst(ws, 'MKT-J');

            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'orderBookResolvers').set('MKT-J', [resolver]);

            call(ws, 'handleOrderbookDelta', {
                market_ticker: 'MKT-J',
                price: 65,
                delta: 5,
                side: 'yes',
            });

            expect(resolver.resolve).toHaveBeenCalledTimes(1);
        });
    });

    // --- Trade Message Handling ----------------------------------------

    describe('handleTrade', () => {
        test('normalizes Kalshi trade format', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'tradeResolvers').set('MKT-T', [resolver]);

            call(ws, 'handleTrade', {
                market_ticker: 'MKT-T',
                trade_id: 'abc123',
                yes_price: 65,
                count: 10,
                taker_side: 'yes',
                created_time: '2025-01-15T12:00:00Z',
            });

            expect(resolver.resolve).toHaveBeenCalledTimes(1);
            const trades = (resolver.resolve as jest.Mock).mock.calls[0][0] as Trade[];
            expect(trades).toHaveLength(1);
            expect(trades[0].id).toBe('abc123');
            expect(trades[0].price).toBeCloseTo(0.65);
            expect(trades[0].amount).toBe(10);
            expect(trades[0].side).toBe('buy');
        });

        test('maps taker_side "no" to "sell"', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'tradeResolvers').set('MKT-U', [resolver]);

            call(ws, 'handleTrade', {
                market_ticker: 'MKT-U',
                trade_id: 'def456',
                yes_price: 40,
                count: 5,
                taker_side: 'no',
                created_time: '2025-01-15T12:00:00Z',
            });

            const trades = (resolver.resolve as jest.Mock).mock.calls[0][0] as Trade[];
            expect(trades[0].side).toBe('sell');
        });

        test('handles timestamp as unix seconds', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'tradeResolvers').set('MKT-V', [resolver]);

            const unixSec = 1705305600; // 2024-01-15T12:00:00Z in seconds
            call(ws, 'handleTrade', {
                market_ticker: 'MKT-V',
                trade_id: 'ts1',
                yes_price: 50,
                count: 1,
                taker_side: 'yes',
                ts: unixSec,
            });

            const trades = (resolver.resolve as jest.Mock).mock.calls[0][0] as Trade[];
            expect(trades[0].timestamp).toBe(unixSec * 1000);
        });

        test('falls back to Date.now() when no timestamp provided', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'tradeResolvers').set('MKT-W', [resolver]);

            const before = Date.now();
            call(ws, 'handleTrade', {
                market_ticker: 'MKT-W',
                trade_id: 'no-ts',
                yes_price: 50,
                count: 1,
                taker_side: 'yes',
            });
            const after = Date.now();

            const trades = (resolver.resolve as jest.Mock).mock.calls[0][0] as Trade[];
            expect(trades[0].timestamp).toBeGreaterThanOrEqual(before);
            expect(trades[0].timestamp).toBeLessThanOrEqual(after);
        });

        test('clears resolver queue after resolution', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'tradeResolvers').set('MKT-X', [resolver]);

            call(ws, 'handleTrade', {
                market_ticker: 'MKT-X',
                trade_id: 'clr',
                yes_price: 50,
                count: 1,
                taker_side: 'yes',
            });

            expect(field(ws, 'tradeResolvers').get('MKT-X')).toEqual([]);
        });
    });

    // --- handleMessage routing -----------------------------------------

    describe('handleMessage', () => {
        test('routes orderbook_snapshot to handler', () => {
            const ws = createKalshiWS();

            call(ws, 'handleMessage', {
                type: 'orderbook_snapshot',
                data: {
                    market_ticker: 'MKT-R1',
                    yes: [{ price: 55, quantity: 10 }],
                    no: [],
                },
            });

            expect(field(ws, 'orderBooks').has('MKT-R1')).toBe(true);
        });

        test('routes orderbook_delta to handler', () => {
            const ws = createKalshiWS();
            // Need snapshot first
            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-R2',
                yes: [{ price: 50, quantity: 10 }],
                no: [],
            });

            call(ws, 'handleMessage', {
                type: 'orderbook_delta',
                data: {
                    market_ticker: 'MKT-R2',
                    price: 50,
                    delta: 5,
                    side: 'yes',
                },
            });

            const book = field(ws, 'orderBooks').get('MKT-R2');
            expect(book.bids[0].size).toBe(15);
        });

        test('routes orderbook_update (alias) to delta handler', () => {
            const ws = createKalshiWS();
            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-R3',
                yes: [{ price: 50, quantity: 10 }],
                no: [],
            });

            call(ws, 'handleMessage', {
                type: 'orderbook_update',
                data: {
                    market_ticker: 'MKT-R3',
                    price: 50,
                    delta: 3,
                    side: 'yes',
                },
            });

            const book = field(ws, 'orderBooks').get('MKT-R3');
            expect(book.bids[0].size).toBe(13);
        });

        test('ignores messages with no data and non-control types', () => {
            const ws = createKalshiWS();
            // Should not throw
            call(ws, 'handleMessage', { type: 'unknown_type' });
            call(ws, 'handleMessage', { type: 'subscribed' });
            call(ws, 'handleMessage', { type: 'pong' });
        });

        test('attaches message-level timestamp as fallback', () => {
            const ws = createKalshiWS();
            const resolver = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'tradeResolvers').set('MKT-TS', [resolver]);

            const msgTs = 1700000000;
            call(ws, 'handleMessage', {
                type: 'trade',
                ts: msgTs,
                data: {
                    market_ticker: 'MKT-TS',
                    trade_id: 'msg-ts',
                    yes_price: 50,
                    count: 1,
                    taker_side: 'yes',
                },
            });

            const trades = (resolver.resolve as jest.Mock).mock.calls[0][0] as Trade[];
            // message_ts should have been injected and used
            expect(trades[0].timestamp).toBe(msgTs * 1000);
        });
    });

    // --- Close / Shutdown ---------------------------------------------

    describe('close', () => {
        test('rejects all pending orderbook promises', async () => {
            const ws = createKalshiWS();

            const promise1 = new Promise<OrderBook>((resolve, reject) => {
                field(ws, 'orderBookResolvers').set('T1', [{ resolve, reject }]);
            });
            const promise2 = new Promise<OrderBook>((resolve, reject) => {
                field(ws, 'orderBookResolvers').set('T2', [{ resolve, reject }]);
            });

            await ws.close();

            await expect(promise1).rejects.toThrow('WebSocket closed for T1');
            await expect(promise2).rejects.toThrow('WebSocket closed for T2');
        });

        test('rejects all pending trade promises', async () => {
            const ws = createKalshiWS();

            const promise = new Promise<Trade[]>((resolve, reject) => {
                field(ws, 'tradeResolvers').set('T3', [{ resolve, reject }]);
            });

            await ws.close();

            await expect(promise).rejects.toThrow('WebSocket closed for T3');
        });

        test('clears resolver maps', async () => {
            const ws = createKalshiWS();
            field(ws, 'orderBookResolvers').set('X', [{ resolve: jest.fn(), reject: jest.fn() }]);
            field(ws, 'tradeResolvers').set('Y', [{ resolve: jest.fn(), reject: jest.fn() }]);

            await ws.close();

            expect(field(ws, 'orderBookResolvers').size).toBe(0);
            expect(field(ws, 'tradeResolvers').size).toBe(0);
        });

        test('sets isTerminated to true', async () => {
            const ws = createKalshiWS();
            await ws.close();
            expect(field(ws, 'isTerminated')).toBe(true);
        });

        test('clears reconnect timer', async () => {
            const ws = createKalshiWS();
            setField(ws, 'reconnectTimer', setTimeout(() => {}, 99999));

            await ws.close();

            expect(field(ws, 'reconnectTimer')).toBeUndefined();
        });
    });

    // --- Reconnection Logic -------------------------------------------

    describe('scheduleReconnect', () => {
        test('calls connect after configured delay', () => {
            const ws = createKalshiWS({ reconnectIntervalMs: 200 });
            const connectSpy = jest.spyOn(ws as any, 'connect').mockResolvedValue(undefined);

            call(ws, 'scheduleReconnect');
            expect(connectSpy).not.toHaveBeenCalled();

            jest.advanceTimersByTime(200);
            expect(connectSpy).toHaveBeenCalledTimes(1);
        });

        test('is no-op when terminated', () => {
            const ws = createKalshiWS();
            setField(ws, 'isTerminated', true);

            call(ws, 'scheduleReconnect');

            // No timer should be set
            expect(field(ws, 'reconnectTimer')).toBeUndefined();
        });

        test('clears existing timer before scheduling new one', () => {
            const ws = createKalshiWS({ reconnectIntervalMs: 200 });
            const connectSpy = jest.spyOn(ws as any, 'connect').mockResolvedValue(undefined);

            call(ws, 'scheduleReconnect');
            call(ws, 'scheduleReconnect');

            jest.advanceTimersByTime(200);
            // Should only connect once (second call replaced the first timer)
            expect(connectSpy).toHaveBeenCalledTimes(1);
        });
    });

    // --- Multiple Watchers Pattern ------------------------------------

    describe('promise resolution with multiple watchers', () => {
        test('multiple watchers on same market all resolve with same data', () => {
            const ws = createKalshiWS();

            const resolver1 = { resolve: jest.fn(), reject: jest.fn() };
            const resolver2 = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'orderBookResolvers').set('MKT-MW', [resolver1, resolver2]);

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-MW',
                yes: [{ price: 55, quantity: 10 }],
                no: [],
            });

            expect(resolver1.resolve).toHaveBeenCalledTimes(1);
            expect(resolver2.resolve).toHaveBeenCalledTimes(1);

            // Both receive the same book reference
            const book1 = (resolver1.resolve as jest.Mock).mock.calls[0][0];
            const book2 = (resolver2.resolve as jest.Mock).mock.calls[0][0];
            expect(book1).toBe(book2);
        });

        test('new watcher after resolution gets fresh promise slot', () => {
            const ws = createKalshiWS();

            const resolver1 = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'orderBookResolvers').set('MKT-NW', [resolver1]);

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-NW',
                yes: [],
                no: [],
            });

            // Queue is cleared
            expect(field(ws, 'orderBookResolvers').get('MKT-NW')).toEqual([]);

            // New watcher can be added
            const resolver2 = { resolve: jest.fn(), reject: jest.fn() };
            field(ws, 'orderBookResolvers').get('MKT-NW')!.push(resolver2);

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'MKT-NW',
                yes: [{ price: 80, quantity: 5 }],
                no: [],
            });

            expect(resolver2.resolve).toHaveBeenCalledTimes(1);
            expect(resolver1.resolve).toHaveBeenCalledTimes(1); // not called again
        });
    });

    // --- Watch Timeout ---------------------------------------------------

    describe('watch timeout', () => {
        test('watchOrderBook rejects after configured timeout when no data arrives', async () => {
            const ws = createKalshiWS({ watchTimeoutMs: 500 });
            setField(ws, 'isConnected', true);
            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            const promise = ws.watchOrderBook('NON-EXISTING');

            jest.advanceTimersByTime(500);
            await expect(promise).rejects.toThrow(
                "watchOrderBook('NON-EXISTING'): timed out after 500ms",
            );
        });

        test('watchOrderBook resolves normally when data arrives before timeout', async () => {
            const ws = createKalshiWS({ watchTimeoutMs: 5000 });
            setField(ws, 'isConnected', true);
            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            const promise = ws.watchOrderBook('MKT-OK');

            // Data arrives at 100ms, well before 5000ms timeout
            setTimeout(() => {
                call(ws, 'handleOrderbookSnapshot', {
                    market_ticker: 'MKT-OK',
                    yes: [{ price: 50, quantity: 10 }],
                    no: [],
                });
            }, 100);

            jest.advanceTimersByTime(100);
            const book = await promise;
            expect(book.bids[0].price).toBeCloseTo(0.50);
        });

        test('watchTrades rejects after configured timeout when no data arrives', async () => {
            const ws = createKalshiWS({ watchTimeoutMs: 300 });
            setField(ws, 'isConnected', true);
            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            const promise = ws.watchTrades('NON-EXISTING');

            jest.advanceTimersByTime(300);
            await expect(promise).rejects.toThrow(
                "watchTrades('NON-EXISTING'): timed out after 300ms",
            );
        });

        test('watchOrderBooks rejects after timeout when not all tickers receive data', async () => {
            const ws = createKalshiWS({ watchTimeoutMs: 500 });
            setField(ws, 'isConnected', true);
            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            const promise = ws.watchOrderBooks(['REAL', 'FAKE']);

            // Only REAL gets data
            setTimeout(() => {
                call(ws, 'handleOrderbookSnapshot', {
                    market_ticker: 'REAL',
                    yes: [{ price: 50, quantity: 10 }],
                    no: [],
                });
            }, 100);

            jest.advanceTimersByTime(100);
            jest.advanceTimersByTime(400);

            await expect(promise).rejects.toThrow(
                'watchOrderBooks(["REAL","FAKE"]): timed out after 500ms',
            );
        });
    });

    // --- Fan-out Fix: subscribe only new ticker --------------------------

    describe('watchOrderBook subscription fan-out fix', () => {
        test('subscribes only the new ticker, not all accumulated tickers', () => {
            const ws = createKalshiWS();
            setField(ws, 'isConnected', true);

            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            // Subscribe to first ticker
            field(ws, 'subscribedOrderBookTickers').add('T1');
            call(ws, 'subscribeToOrderbook', ['T1']);

            // Simulate that T1 is already subscribed, now subscribe T2
            setField(ws, 'isConnected', true);
            field(ws, 'subscribedOrderBookTickers').add('T2');

            // The fix: only send T2, not [T1, T2]
            call(ws, 'subscribeToOrderbook', ['T2']);

            // Check the last send call only contains T2
            const lastCall = mockWsInstance.send.mock.calls[mockWsInstance.send.mock.calls.length - 1];
            const lastMsg = JSON.parse(lastCall[0]);
            expect(lastMsg.params.market_tickers).toEqual(['T2']);
        });
    });

    // --- Batch watchOrderBooks -------------------------------------------

    describe('watchOrderBooks', () => {
        test('sends one subscribe message for all new tickers', () => {
            const ws = createKalshiWS();
            setField(ws, 'isConnected', true);

            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            // Call watchOrderBooks with 3 tickers (none previously subscribed)
            ws.watchOrderBooks(['T1', 'T2', 'T3']);

            // Should have sent exactly one subscribe message
            expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
            const msg = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
            expect(msg.params.market_tickers).toEqual(['T1', 'T2', 'T3']);
            expect(msg.params.channels).toEqual(['orderbook_delta']);
        });

        test('only subscribes tickers not already subscribed', () => {
            const ws = createKalshiWS();
            setField(ws, 'isConnected', true);

            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            // Pre-subscribe T1
            field(ws, 'subscribedOrderBookTickers').add('T1');

            // Call watchOrderBooks with T1 (already subscribed) and T2 (new)
            ws.watchOrderBooks(['T1', 'T2']);

            expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
            const msg = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
            expect(msg.params.market_tickers).toEqual(['T2']);
        });

        test('does not send subscribe when all tickers already subscribed', () => {
            const ws = createKalshiWS();
            setField(ws, 'isConnected', true);

            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            // Pre-subscribe both
            field(ws, 'subscribedOrderBookTickers').add('T1');
            field(ws, 'subscribedOrderBookTickers').add('T2');

            ws.watchOrderBooks(['T1', 'T2']);

            // No subscribe message sent (but resolvers are still registered)
            expect(mockWsInstance.send).not.toHaveBeenCalled();
        });

        test('resolves when all tickers receive snapshots', async () => {
            const ws = createKalshiWS();
            setField(ws, 'isConnected', true);

            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            const promise = ws.watchOrderBooks(['A', 'B']);

            // Simulate snapshots arriving
            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'A',
                yes: [{ price: 50, quantity: 10 }],
                no: [],
            });

            call(ws, 'handleOrderbookSnapshot', {
                market_ticker: 'B',
                yes: [{ price: 60, quantity: 20 }],
                no: [],
            });

            const result = await promise;

            expect(result).toHaveProperty('A');
            expect(result).toHaveProperty('B');
            expect(result.A.bids[0].price).toBeCloseTo(0.50);
            expect(result.B.bids[0].price).toBeCloseTo(0.60);
        });

        test('adds all tickers to subscribedOrderBookTickers', () => {
            const ws = createKalshiWS();
            setField(ws, 'isConnected', true);

            const mockWsInstance = { send: jest.fn(), on: jest.fn() };
            setField(ws, 'ws', mockWsInstance);

            ws.watchOrderBooks(['X1', 'X2', 'X3']);

            const subs: Set<string> = field(ws, 'subscribedOrderBookTickers');
            expect(subs.has('X1')).toBe(true);
            expect(subs.has('X2')).toBe(true);
            expect(subs.has('X3')).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// Myriad WebSocket Tests (Polling Pattern)
// ---------------------------------------------------------------------------

describe('MyriadWebSocket', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function createMyriadWS(overrides: {
        fetchOrderBook?: jest.Mock;
        callApi?: jest.Mock;
        pollInterval?: number;
    } = {}) {
        const mockFetchOrderBook = overrides.fetchOrderBook ?? jest.fn<() => Promise<OrderBook>>().mockResolvedValue({
            bids: [{ price: 0.6, size: 100 }],
            asks: [{ price: 0.65, size: 80 }],
            timestamp: 1700000000000,
        });
        const mockCallApi = overrides.callApi ?? jest.fn().mockResolvedValue({ data: [] });

        return {
            ws: new MyriadWebSocket(mockCallApi, mockFetchOrderBook, overrides.pollInterval ?? 100),
            mockFetchOrderBook,
            mockCallApi,
        };
    }

    describe('watchOrderBook', () => {
        test('starts polling and resolves on first fetch', async () => {
            const { ws, mockFetchOrderBook } = createMyriadWS();

            const promise = ws.watchOrderBook('market-1');

            // Flush the immediate poll (microtask)
            await jest.advanceTimersByTimeAsync(0);

            const book = await promise;
            expect(mockFetchOrderBook).toHaveBeenCalledWith('market-1');
            expect(book.bids[0].price).toBeCloseTo(0.6);
            expect(book.asks[0].price).toBeCloseTo(0.65);
        });

        test('multiple watchers on same id all resolve', async () => {
            const { ws } = createMyriadWS();

            const p1 = ws.watchOrderBook('market-2');
            const p2 = ws.watchOrderBook('market-2');

            await jest.advanceTimersByTimeAsync(0);

            const [b1, b2] = await Promise.all([p1, p2]);
            expect(b1.bids).toEqual(b2.bids);
        });

        test('does not start duplicate polling timers for same id', async () => {
            const { ws, mockFetchOrderBook } = createMyriadWS();

            ws.watchOrderBook('market-3');
            ws.watchOrderBook('market-3');

            await jest.advanceTimersByTimeAsync(0);

            // Only one initial poll call
            expect(mockFetchOrderBook).toHaveBeenCalledTimes(1);
        });

        test('continues polling at interval', async () => {
            const { ws, mockFetchOrderBook } = createMyriadWS({ pollInterval: 200 });

            ws.watchOrderBook('market-4');
            await jest.advanceTimersByTimeAsync(0);

            // First call from immediate poll
            expect(mockFetchOrderBook).toHaveBeenCalledTimes(1);

            await jest.advanceTimersByTimeAsync(200);
            expect(mockFetchOrderBook).toHaveBeenCalledTimes(2);

            await jest.advanceTimersByTimeAsync(200);
            expect(mockFetchOrderBook).toHaveBeenCalledTimes(3);

            await ws.close();
        });

        test('silently retries on fetch error', async () => {
            const failingFetch = jest.fn<() => Promise<OrderBook>>()
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce({
                    bids: [{ price: 0.5, size: 10 }],
                    asks: [],
                    timestamp: 1700000000000,
                });

            const { ws } = createMyriadWS({ fetchOrderBook: failingFetch, pollInterval: 100 });

            const promise = ws.watchOrderBook('market-5');

            // First poll fails
            await jest.advanceTimersByTimeAsync(0);

            // Second poll succeeds after interval
            await jest.advanceTimersByTimeAsync(100);

            const book = await promise;
            expect(book.bids[0].price).toBeCloseTo(0.5);

            await ws.close();
        });
    });

    describe('watchTrades', () => {
        test('throws after close', async () => {
            const { ws } = createMyriadWS();
            await ws.close();

            await expect(ws.watchTrades('market-6')).rejects.toThrow('WebSocket connection is closed');
        });
    });

    describe('close', () => {
        test('clears all polling timers', async () => {
            const { ws, mockFetchOrderBook } = createMyriadWS({ pollInterval: 100 });

            ws.watchOrderBook('market-7');
            await jest.advanceTimersByTimeAsync(0);

            await ws.close();

            const callsBefore = mockFetchOrderBook.mock.calls.length;
            await jest.advanceTimersByTimeAsync(500);
            // No more calls after close
            expect(mockFetchOrderBook).toHaveBeenCalledTimes(callsBefore);
        });

        test('sets closed flag', async () => {
            const { ws } = createMyriadWS();
            await ws.close();
            expect((ws as any).closed).toBe(true);
        });

        test('watchOrderBook throws after close', async () => {
            const { ws } = createMyriadWS();
            await ws.close();

            await expect(ws.watchOrderBook('market-8')).rejects.toThrow('WebSocket connection is closed');
        });

        test('clears resolver maps', async () => {
            const { ws } = createMyriadWS();
            ws.watchOrderBook('market-9');
            await jest.advanceTimersByTimeAsync(0);

            await ws.close();

            expect((ws as any).orderBookResolvers.size).toBe(0);
            expect((ws as any).tradeResolvers.size).toBe(0);
            expect((ws as any).orderBookTimers.size).toBe(0);
            expect((ws as any).tradeTimers.size).toBe(0);
        });
    });
});
