import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Server } from 'http';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Mock ALL exchange modules to prevent heavy dependency loading (OOM).
// Same pattern as server-api.test.ts.
// ---------------------------------------------------------------------------

const mockExchangeInstance: Record<string, any> = {
    watchOrderBook: jest.fn().mockImplementation(async (_id: string) => ({
        bids: [{ price: 0.65, size: 100 }],
        asks: [{ price: 0.70, size: 80 }],
        timestamp: Date.now(),
    })),
    watchOrderBooks: jest.fn().mockImplementation(async (ids: string[]) => {
        const result: Record<string, any> = {};
        for (const id of ids) {
            result[id] = {
                bids: [{ price: 0.65, size: 100 }],
                asks: [{ price: 0.70, size: 80 }],
                timestamp: Date.now(),
            };
        }
        return result;
    }),
    close: jest.fn().mockResolvedValue(undefined),
    verbose: false,
};

const ctor = jest.fn().mockImplementation(() => ({ ...mockExchangeInstance }));

jest.mock('../../src/exchanges/polymarket', () => ({ PolymarketExchange: ctor }));
jest.mock('../../src/exchanges/limitless', () => ({ LimitlessExchange: ctor }));
jest.mock('../../src/exchanges/kalshi', () => ({ KalshiExchange: ctor }));
jest.mock('../../src/exchanges/kalshi-demo', () => ({ KalshiDemoExchange: ctor }));
jest.mock('../../src/exchanges/probable', () => ({ ProbableExchange: ctor }));
jest.mock('../../src/exchanges/baozi', () => ({ BaoziExchange: ctor }));
jest.mock('../../src/exchanges/myriad', () => ({ MyriadExchange: ctor }));
jest.mock('../../src/exchanges/opinion', () => ({ OpinionExchange: ctor }));
jest.mock('../../src/exchanges/metaculus', () => ({ MetaculusExchange: ctor }));
jest.mock('../../src/exchanges/smarkets', () => ({ SmarketsExchange: ctor }));
jest.mock('../../src/exchanges/polymarket_us', () => ({ PolymarketUSExchange: ctor }));
jest.mock('../../src/router', () => ({ Router: ctor }));

// Suppress console noise
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

import { createWebSocketHandler } from '../../src/server/ws-handler';
import express from 'express';

const TEST_TOKEN = 'ws-test-token';

let server: Server;
let port: number;

function wsUrl(path = '/ws', token?: string): string {
    const qs = token ? `?token=${token}` : '';
    return `ws://127.0.0.1:${port}${path}${qs}`;
}

function connectWs(token?: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl('/ws', token));
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), timeoutMs);
        ws.once('message', (data) => {
            clearTimeout(timer);
            resolve(JSON.parse(data.toString()));
        });
    });
}

function closeWs(ws: WebSocket): Promise<void> {
    return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
        }
        ws.on('close', () => resolve());
        ws.close();
    });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll((done) => {
    const app = express();
    server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
            port = addr.port;
        }

        const wsHandler = createWebSocketHandler({ accessToken: TEST_TOKEN });
        wsHandler.attach(server);

        done();
    });
});

afterAll(() => {
    server?.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sidecar WebSocket Handler', () => {
    test('rejects connection without token', (done) => {
        const ws = new WebSocket(wsUrl('/ws'));
        ws.on('error', () => done());
        ws.on('close', () => done());
    });

    test('rejects connection with wrong token', (done) => {
        const ws = new WebSocket(wsUrl('/ws', 'wrong-token'));
        ws.on('error', () => done());
        ws.on('close', () => done());
    });

    test('accepts connection with correct token', async () => {
        const ws = await connectWs(TEST_TOKEN);
        expect(ws.readyState).toBe(WebSocket.OPEN);
        await closeWs(ws);
    });

    test('rejects connection to wrong path', (done) => {
        const ws = new WebSocket(wsUrl('/other', TEST_TOKEN));
        ws.on('error', () => done());
        ws.on('close', () => done());
    });

    test('returns error for invalid JSON', async () => {
        const ws = await connectWs(TEST_TOKEN);
        ws.send('not json at all');

        const msg = await waitForMessage(ws);
        expect(msg.event).toBe('error');
        expect(msg.error.message).toContain('Invalid JSON');

        await closeWs(ws);
    });

    test('returns error for missing required fields', async () => {
        const ws = await connectWs(TEST_TOKEN);
        ws.send(JSON.stringify({ id: 'r1' }));

        const msg = await waitForMessage(ws);
        expect(msg.event).toBe('error');
        expect(msg.error.message).toContain('Missing required fields');

        await closeWs(ws);
    });

    test('returns error for non-streaming method', async () => {
        const ws = await connectWs(TEST_TOKEN);
        ws.send(JSON.stringify({
            id: 'r1',
            action: 'subscribe',
            exchange: 'kalshi',
            method: 'fetchMarkets',
            args: [],
        }));

        const msg = await waitForMessage(ws);
        expect(msg.event).toBe('error');
        expect(msg.id).toBe('r1');
        expect(msg.error.message).toContain('not a streaming method');

        await closeWs(ws);
    });

    test('subscribes to watchOrderBook and receives data', async () => {
        const ws = await connectWs(TEST_TOKEN);

        ws.send(JSON.stringify({
            id: 'r1',
            action: 'subscribe',
            exchange: 'kalshi',
            method: 'watchOrderBook',
            args: ['TICKER-1'],
            credentials: { apiKey: 'key', privateKey: 'pk' },
        }));

        // First message: subscribed acknowledgement
        const sub = await waitForMessage(ws);
        expect(sub.event).toBe('subscribed');
        expect(sub.id).toBe('r1');

        // Second message: data
        const data = await waitForMessage(ws);
        expect(data.event).toBe('data');
        expect(data.id).toBe('r1');
        expect(data.method).toBe('watchOrderBook');
        expect(data.symbol).toBe('TICKER-1');
        expect(data.data).toHaveProperty('bids');
        expect(data.data).toHaveProperty('asks');

        await closeWs(ws);
    });

    test('subscribes to watchOrderBooks and receives per-symbol data', async () => {
        const ws = await connectWs(TEST_TOKEN);

        ws.send(JSON.stringify({
            id: 'r2',
            action: 'subscribe',
            exchange: 'kalshi',
            method: 'watchOrderBooks',
            args: [['T1', 'T2']],
            credentials: { apiKey: 'key', privateKey: 'pk' },
        }));

        const sub = await waitForMessage(ws);
        expect(sub.event).toBe('subscribed');
        expect(sub.id).toBe('r2');

        // Receive data for each symbol
        const data1 = await waitForMessage(ws);
        expect(data1.event).toBe('data');
        expect(data1.method).toBe('watchOrderBooks');
        expect(['T1', 'T2']).toContain(data1.symbol);

        const data2 = await waitForMessage(ws);
        expect(data2.event).toBe('data');
        expect(['T1', 'T2']).toContain(data2.symbol);

        await closeWs(ws);
    });

    test('returns error for unknown action', async () => {
        const ws = await connectWs(TEST_TOKEN);

        ws.send(JSON.stringify({
            id: 'r5',
            action: 'doSomething',
            exchange: 'kalshi',
            method: 'watchOrderBook',
            args: [],
        }));

        const msg = await waitForMessage(ws);
        expect(msg.event).toBe('error');
        expect(msg.error.message).toContain('Unknown action');

        await closeWs(ws);
    });
});
