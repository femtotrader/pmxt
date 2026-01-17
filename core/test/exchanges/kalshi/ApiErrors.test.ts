import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi API Error Handling Test
 * 
 * What: Tests how the exchange handles various API error responses (4xx, 5xx).
 * Why: External APIs can fail with rate limits, authentication errors, or server issues.
 *      The library must handle these gracefully without crashing.
 * How: Mocks different HTTP error responses and verifies proper error handling.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - API Error Handling', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should handle 404 errors in getMarketsBySlug', async () => {
        const error = {
            response: {
                status: 404,
                data: { error: 'Event not found' }
            },
            isAxiosError: true
        };
        mockedAxios.get.mockRejectedValue(error);
        // @ts-expect-error - Mock type mismatch is expected in tests
        mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

        await expect(exchange.getMarketsBySlug('INVALID-EVENT'))
            .rejects
            .toThrow(/not found/i);
    });

    it('should handle 500 errors in getMarketsBySlug', async () => {
        const error = {
            response: {
                status: 500,
                data: { error: 'Internal Server Error' }
            },
            isAxiosError: true
        };
        mockedAxios.get.mockRejectedValue(error);
        // @ts-expect-error - Mock type mismatch is expected in tests
        mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

        await expect(exchange.getMarketsBySlug('SOME-EVENT'))
            .rejects
            .toThrow(/API Error/i);
    });

    it('should handle network errors in fetchMarkets', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Network timeout'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const markets = await exchange.fetchMarkets();

        expect(markets).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should handle malformed response data', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                events: [
                    {
                        // Missing required fields
                        event_ticker: 'TEST',
                        markets: [{ ticker: 'TEST-MARKET' }]
                    }
                ]
            }
        });

        const markets = await exchange.fetchMarkets();

        // Should not crash, may return empty or partial data
        expect(Array.isArray(markets)).toBe(true);
    });

    it('should handle invalid ticker format in fetchOHLCV', async () => {
        await expect(exchange.fetchOHLCV('INVALID', { resolution: '1h' }))
            .rejects
            .toThrow(/Invalid Kalshi Ticker format/i);
    });

    it('should handle API errors in fetchOHLCV', async () => {
        const error = {
            response: {
                status: 400,
                data: { error: 'Invalid parameters' }
            },
            isAxiosError: true
        };
        mockedAxios.get.mockRejectedValue(error);
        // @ts-expect-error - Mock type mismatch is expected in tests
        mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

        await expect(exchange.fetchOHLCV('FED-25JAN-B4.75', { resolution: '1h' }))
            .rejects
            .toThrow(/History API Error/i);
    });

    it('should return empty orderbook on error', async () => {
        mockedAxios.get.mockRejectedValue(new Error('API Error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const orderbook = await exchange.fetchOrderBook('TEST-TICKER');

        expect(orderbook).toEqual({ bids: [], asks: [] });
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should return empty trades on error', async () => {
        mockedAxios.get.mockRejectedValue(new Error('API Error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const trades = await exchange.fetchTrades('TEST-TICKER', { resolution: '1h' });

        expect(trades).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
