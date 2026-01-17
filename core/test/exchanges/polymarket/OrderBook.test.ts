import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket fetchOrderBook() Test
 * 
 * What: Tests fetching and parsing of CLOB order book data.
 * Why: Order book data is critical for trading and price discovery.
 * How: Mocks Polymarket CLOB API responses and verifies correct parsing and sorting.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - fetchOrderBook', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should parse orderbook data correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [
                    { price: '0.52', size: '100' },
                    { price: '0.51', size: '250' },
                    { price: '0.50', size: '500' }
                ],
                asks: [
                    { price: '0.53', size: '150' },
                    { price: '0.54', size: '200' },
                    { price: '0.55', size: '300' }
                ],
                timestamp: '2025-01-08T12:00:00Z'
            }
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook.bids).toBeDefined();
        expect(orderbook.asks).toBeDefined();
        expect(orderbook.bids.length).toBe(3);
        expect(orderbook.asks.length).toBe(3);
    });

    it('should convert string prices to numbers', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [{ price: '0.52', size: '100' }],
                asks: [{ price: '0.53', size: '150' }]
            }
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(typeof orderbook.bids[0].price).toBe('number');
        expect(typeof orderbook.bids[0].size).toBe('number');
        expect(orderbook.bids[0].price).toBe(0.52);
        expect(orderbook.bids[0].size).toBe(100);
    });

    it('should sort bids in descending order', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [
                    { price: '0.50', size: '100' },
                    { price: '0.52', size: '200' },
                    { price: '0.51', size: '150' }
                ],
                asks: []
            }
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook.bids[0].price).toBeGreaterThanOrEqual(orderbook.bids[1].price);
        expect(orderbook.bids[1].price).toBeGreaterThanOrEqual(orderbook.bids[2].price);
    });

    it('should sort asks in ascending order', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [],
                asks: [
                    { price: '0.55', size: '100' },
                    { price: '0.53', size: '200' },
                    { price: '0.54', size: '150' }
                ]
            }
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook.asks[0].price).toBeLessThanOrEqual(orderbook.asks[1].price);
        expect(orderbook.asks[1].price).toBeLessThanOrEqual(orderbook.asks[2].price);
    });

    it('should handle empty orderbook', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [],
                asks: []
            }
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook.bids).toEqual([]);
        expect(orderbook.asks).toEqual([]);
    });

    it('should include timestamp', async () => {
        const mockTimestamp = '2025-01-08T12:00:00Z';
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [{ price: '0.52', size: '100' }],
                asks: [{ price: '0.53', size: '150' }],
                timestamp: mockTimestamp
            }
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook.timestamp).toBeDefined();
        expect(typeof orderbook.timestamp).toBe('number');
    });

    it('should handle missing timestamp with current time', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [{ price: '0.52', size: '100' }],
                asks: [{ price: '0.53', size: '150' }]
            }
        });

        const before = Date.now();
        const orderbook = await exchange.fetchOrderBook('token123456789');
        const after = Date.now();

        expect(orderbook.timestamp).toBeGreaterThanOrEqual(before);
        expect(orderbook.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle missing bids/asks fields', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {}
        });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook.bids).toEqual([]);
        expect(orderbook.asks).toEqual([]);
    });

    it('should return empty orderbook on error', async () => {
        mockedAxios.get.mockRejectedValue(new Error('API Error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const orderbook = await exchange.fetchOrderBook('token123456789');

        expect(orderbook).toEqual({ bids: [], asks: [] });
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
