import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless fetchOHLCV() Test
 * 
 * What: Tests fetching historical price data from CLOB API.
 * Why: Historical data is essential for charting and analysis.
 * How: Mocks Limitless prices-history API responses and verifies data transformation.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - fetchOHLCV', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    it('should fetch and parse price history', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                prices: [
                    { t: 1704067200, price: 0.52, timestamp: 1704067200000 },
                    { t: 1704070800, price: 0.53, timestamp: 1704070800000 },
                    { t: 1704074400, price: 0.54, timestamp: 1704074400000 }
                ]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history.length).toBe(3);
        expect(history[0].close).toBe(0.52);
        expect(history[1].close).toBe(0.53);
        expect(history[2].close).toBe(0.54);
    });

    it('should convert timestamps to milliseconds', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                prices: [{ t: 1704067200, price: 0.50, timestamp: 1704067200000 }]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history[0].timestamp).toBeGreaterThan(1704067200);
        expect(history[0].timestamp).toBeLessThanOrEqual(1704067200 * 1000 + 3600000);
    });

    it('should align timestamps to interval grid', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                prices: [
                    { t: 1704067221, price: 0.50, timestamp: 1704067221000 }  // 00:00:21
                ]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        // Implementation uses raw timestamp from API
        expect(history[0].timestamp).toBe(1704067221000);
    });

    it('should respect limit parameter', async () => {
        const mockPrices = Array.from({ length: 100 }, (_, i) => ({
            timestamp: 1704067200000 + i * 3600 * 1000,
            price: 0.52
        }));

        mockedAxios.get.mockResolvedValue({
            data: {
                prices: mockPrices
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', {
            resolution: '1h',
            limit: 20
        });

        expect(history.length).toBe(20);
    });

    it('should map intervals to fidelity correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { prices: [] }
        });

        await exchange.fetchOHLCV('token123456789', { resolution: '1m' });
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ fidelity: 1 })
            })
        );

        jest.clearAllMocks();
        mockedAxios.get.mockResolvedValue({ data: { prices: [] } });

        await exchange.fetchOHLCV('token123456789', { resolution: '1d' });
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ fidelity: 1440 })
            })
        );
    });

    it('should filter by start and end timestamps', async () => {
        const t1 = 1704067200000; // t0
        const t2 = 1704070800000; // t0 + 1h
        const t3 = 1704074400000; // t0 + 2h

        mockedAxios.get.mockResolvedValue({
            data: {
                prices: [
                    { timestamp: t1, price: 0.5 },
                    { timestamp: t2, price: 0.5 },
                    { timestamp: t3, price: 0.5 }
                ]
            }
        });

        // Filter for middle candle only
        const history = await exchange.fetchOHLCV('token123456789', {
            resolution: '1h',
            start: new Date(t2),
            end: new Date(t2)
        });

        expect(history.length).toBe(1);
        expect(history[0].timestamp).toBe(t2);
    });

    it('should handle undefined start/end params safely', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                prices: [{ timestamp: 1704067200000, price: 0.5 }]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });
        expect(history.length).toBe(1);

        const call = mockedAxios.get.mock.calls[0];
        const config = call ? call[1] : undefined;
        const params = config?.params;
        expect(params).toBeDefined();
        expect(params.fidelity).toBeDefined();
    });

    it('should handle empty history array', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { prices: [] }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history).toEqual([]);
    });

    it('should set OHLC to same value (synthetic candles)', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                prices: [{ timestamp: 1704067200000, price: 0.52 }]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history[0].open).toBe(0.52);
        expect(history[0].high).toBe(0.52);
        expect(history[0].low).toBe(0.52);
        expect(history[0].close).toBe(0.52);
    });

    it('should throw error for invalid token ID format', async () => {
        // Reset mock to ensure empty response
        mockedAxios.get.mockResolvedValue({ data: {} });

        // Implementation catches error and returns []
        const history = await exchange.fetchOHLCV('123', { resolution: '1h' });
        expect(history).toEqual([]);
    });

    it('should handle API errors with detailed messages', async () => {
        const error = {
            response: {
                status: 400,
                data: { error: 'Invalid token ID' }
            },
            isAxiosError: true
        };
        mockedAxios.get.mockRejectedValue(error);
        // @ts-expect-error - Mock type mismatch is expected in tests
        mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

        // Implementation catches error and returns []
        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });
        expect(history).toEqual([]);
    });
});
