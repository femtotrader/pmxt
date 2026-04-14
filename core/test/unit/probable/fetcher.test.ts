import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProbableFetcher } from '../../../src/exchanges/probable/fetcher';
import { FetcherContext } from '../../../src/exchanges/interfaces';

// ---------------------------------------------------------------------------
// Mock FetcherContext
// ---------------------------------------------------------------------------

function createMockCtx(overrides: {
    callApi?: (opId: string, params?: any) => Promise<any>;
    httpGet?: (url: string, config?: any) => Promise<any>;
} = {}): FetcherContext {
    return {
        http: {
            get: overrides.httpGet ?? (async () => ({ data: null })),
        } as any,
        callApi: overrides.callApi ?? (async () => null),
        getHeaders: () => ({}),
    };
}

// ---------------------------------------------------------------------------
// fetchRawOHLCV
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawOHLCV', () => {
    test('returns history array from { history: [...] } response', async () => {
        const points = [{ p: 0.5, t: 1700000000 }];
        const ctx = createMockCtx({ callApi: async () => ({ history: points }) });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawOHLCV('mkt-1', { resolution: '1h' } as any);
        expect(result).toEqual(points);
    });

    test('returns raw array when response is already an array', async () => {
        const points = [{ p: 0.5, t: 1700000000 }];
        const ctx = createMockCtx({ callApi: async () => points });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawOHLCV('mkt-1', { resolution: '1h' } as any);
        expect(result).toEqual(points);
    });

    test('throws on unexpected response shape (string)', async () => {
        const ctx = createMockCtx({ callApi: async () => 'not-valid' });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawOHLCV('mkt-1', { resolution: '1h' } as any))
            .rejects.toThrow(/unexpected response shape/);
    });

    test('throws on unexpected response shape (null)', async () => {
        const ctx = createMockCtx({ callApi: async () => null });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawOHLCV('mkt-1', { resolution: '1h' } as any))
            .rejects.toThrow(/unexpected response shape/);
    });

    test('throws on object without history key', async () => {
        const ctx = createMockCtx({ callApi: async () => ({ data: [1, 2, 3] }) });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawOHLCV('mkt-1', { resolution: '1h' } as any))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawTrades
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawTrades', () => {
    test('returns array when response is an array', async () => {
        const trades = [{ id: 't1', price: '0.5' }];
        const ctx = createMockCtx({ callApi: async () => trades });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawTrades('tok-1', { limit: 10 } as any);
        expect(result).toEqual(trades);
    });

    test('throws when response is an object instead of array', async () => {
        const ctx = createMockCtx({ callApi: async () => ({ data: [{ id: 't1' }] }) });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawTrades('tok-1', { limit: 10 } as any))
            .rejects.toThrow(/unexpected response shape/);
    });

    test('throws when response is null', async () => {
        const ctx = createMockCtx({ callApi: async () => null });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawTrades('tok-1', { limit: 10 } as any))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawMyTrades
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawMyTrades', () => {
    test('returns array when response is an array', async () => {
        const trades = [{ id: 't1' }];
        const ctx = createMockCtx({ callApi: async () => trades });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawMyTrades({ limit: 10 } as any, '0xabc');
        expect(result).toEqual(trades);
    });

    test('throws when response is not an array', async () => {
        const ctx = createMockCtx({ callApi: async () => ({ data: [] }) });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawMyTrades({ limit: 10 } as any, '0xabc'))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawPositions
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawPositions', () => {
    test('returns array when response is an array', async () => {
        const positions = [{ condition_id: 'c1', token_id: 't1', size: '5' }];
        const ctx = createMockCtx({ callApi: async () => positions });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawPositions('0xabc');
        expect(result).toEqual(positions);
    });

    test('throws when response is not an array', async () => {
        const ctx = createMockCtx({ callApi: async () => ({ data: [] }) });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawPositions('0xabc'))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawMarketsList (via fetchRawMarkets with no params)
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawMarkets (list)', () => {
    test('returns markets from { markets: [...] } response', async () => {
        const markets = [{ id: 1, question: 'Test?' }];
        const ctx = createMockCtx({
            httpGet: async () => ({ data: { markets } }),
        });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawMarkets({});
        expect(result).toEqual(markets);
    });

    test('throws when response lacks markets key', async () => {
        const ctx = createMockCtx({
            httpGet: async () => ({ data: { items: [] } }),
        });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawMarkets({}))
            .rejects.toThrow(/unexpected response shape/);
    });

    test('throws when response.data.markets is not an array', async () => {
        const ctx = createMockCtx({
            httpGet: async () => ({ data: { markets: 'not-array' } }),
        });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawMarkets({}))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawMarketsViaSearch (via fetchRawMarkets with query)
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawMarkets (search)', () => {
    test('returns markets from search { events: [...] } response', async () => {
        const events = [{ id: 1, markets: [{ id: 10, question: 'Test?' }] }];
        const ctx = createMockCtx({ callApi: async () => ({ events }) });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawMarkets({ query: 'test' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(10);
    });

    test('throws when search response lacks events key', async () => {
        const ctx = createMockCtx({ callApi: async () => ({ results: [] }) });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawMarkets({ query: 'test' }))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawEventsList
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawEvents (list)', () => {
    test('returns array from events list', async () => {
        const events = [{ id: 1, title: 'Event 1' }];
        const ctx = createMockCtx({
            httpGet: async () => ({ data: events }),
        });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawEvents({});
        expect(result).toEqual(events);
    });

    test('throws when events list response is not an array', async () => {
        const ctx = createMockCtx({
            httpGet: async () => ({ data: { events: [] } }),
        });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawEvents({}))
            .rejects.toThrow(/unexpected response shape/);
    });
});

// ---------------------------------------------------------------------------
// fetchRawEventsViaSearch
// ---------------------------------------------------------------------------

describe('ProbableFetcher.fetchRawEvents (search)', () => {
    test('returns events from search response', async () => {
        const events = [{ id: 1, title: 'Found event' }];
        const ctx = createMockCtx({ callApi: async () => ({ events }) });
        const fetcher = new ProbableFetcher(ctx);

        const result = await fetcher.fetchRawEvents({ query: 'test' });
        expect(result).toEqual(events);
    });

    test('throws when search response lacks events key', async () => {
        const ctx = createMockCtx({ callApi: async () => ({ results: [] }) });
        const fetcher = new ProbableFetcher(ctx);

        await expect(fetcher.fetchRawEvents({ query: 'test' }))
            .rejects.toThrow(/unexpected response shape/);
    });
});
