/**
 * Tests that PolymarketUSExchange methods throw when SDK responses
 * are missing required fields, rather than silently falling back
 * to empty arrays/objects.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// We test the exchange class directly by mocking the SDK client.
// Since the constructor creates the client internally, we mock the
// module factory.

const mockMarketsList = jest.fn();
const mockEventsList = jest.fn();
const mockPositions = jest.fn();
const mockActivities = jest.fn();
const mockOrdersList = jest.fn();
const mockOrdersCreate = jest.fn();
const mockOrdersRetrieve = jest.fn();
const mockMarketsBook = jest.fn();

jest.mock('polymarket-us', () => ({
    PolymarketUS: jest.fn().mockImplementation(() => ({
        markets: { list: mockMarketsList, retrieveBySlug: jest.fn(), book: mockMarketsBook },
        events: { list: mockEventsList, retrieveBySlug: jest.fn() },
        portfolio: { positions: mockPositions, activities: mockActivities },
        orders: { list: mockOrdersList, create: mockOrdersCreate, retrieve: mockOrdersRetrieve, cancel: jest.fn() },
        account: { balances: jest.fn() },
    })),
}));

import { PolymarketUSExchange } from '../../../src/exchanges/polymarket_us/index';
import { PolymarketUSNormalizer } from '../../../src/exchanges/polymarket_us/normalizer';

const creds = { apiKey: 'test-key', privateKey: 'test-secret' };

describe('PolymarketUS silent-fallback removal', () => {
    let exchange: PolymarketUSExchange;

    beforeEach(() => {
        jest.clearAllMocks();
        exchange = new PolymarketUSExchange(creds);
    });

    test('fetchMarkets throws when resp.markets is undefined', async () => {
        mockMarketsList.mockResolvedValue({});
        await expect(exchange.fetchMarkets()).rejects.toThrow();
    });

    test('fetchMarkets throws when resp.markets is null', async () => {
        mockMarketsList.mockResolvedValue({ markets: null });
        await expect(exchange.fetchMarkets()).rejects.toThrow();
    });

    test('fetchEvents throws when resp.events is undefined', async () => {
        mockEventsList.mockResolvedValue({});
        await expect(exchange.fetchEvents({})).rejects.toThrow();
    });

    test('fetchEvents throws when resp.events is null', async () => {
        mockEventsList.mockResolvedValue({ events: null });
        await expect(exchange.fetchEvents({})).rejects.toThrow();
    });

    test('fetchPositions throws when resp.positions is undefined', async () => {
        mockPositions.mockResolvedValue({});
        await expect(exchange.fetchPositions()).rejects.toThrow();
    });

    test('fetchPositions throws when resp.positions is null', async () => {
        mockPositions.mockResolvedValue({ positions: null });
        await expect(exchange.fetchPositions()).rejects.toThrow();
    });

    test('fetchMyTrades throws when resp.activities is undefined', async () => {
        mockActivities.mockResolvedValue({});
        await expect(exchange.fetchMyTrades()).rejects.toThrow();
    });

    test('fetchOpenOrders throws when resp.orders is undefined', async () => {
        mockOrdersList.mockResolvedValue({});
        await expect(exchange.fetchOpenOrders()).rejects.toThrow();
    });

    test('submitOrder propagates fetchOrder error instead of synthesizing a fake Order', async () => {
        mockOrdersCreate.mockResolvedValue({ id: 'order-1' });
        mockOrdersRetrieve.mockRejectedValue(new Error('order not found'));

        const built = {
            exchange: 'PolymarketUS',
            params: {
                marketId: 'test-slug',
                outcomeId: 'test-slug:long',
                side: 'buy' as const,
                type: 'limit' as const,
                price: 0.5,
                amount: 10,
            },
            raw: {},
        };

        await expect(exchange.submitOrder(built)).rejects.toThrow();
    });
});

describe('PolymarketUSNormalizer orderbook handling', () => {
    const normalizer = new PolymarketUSNormalizer();

    test('normalizeOrderBook treats missing bids as empty (no liquidity)', () => {
        const book = { offers: [{ px: '500000', qty: '10' }] } as any;
        const ob = normalizer.normalizeOrderBook(book, 'test');
        expect(ob.bids).toHaveLength(0);
        expect(ob.asks).toHaveLength(1);
    });

    test('normalizeOrderBook treats missing offers as empty (no liquidity)', () => {
        const book = { bids: [{ px: '500000', qty: '10' }] } as any;
        const ob = normalizer.normalizeOrderBook(book, 'test');
        expect(ob.bids).toHaveLength(1);
        expect(ob.asks).toHaveLength(0);
    });
});
