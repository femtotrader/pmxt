import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket fetchOHLCV() Test
 * 
 * What: Tests fetching historical price data from CLOB API.
 * Why: Historical data is essential for charting and analysis.
 * How: Mocks Polymarket prices-history API responses and verifies data transformation.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - fetchOHLCV', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should fetch and parse price history', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                history: [
                    { t: 1704067200, p: 0.52 },
                    { t: 1704070800, p: 0.53 },
                    { t: 1704074400, p: 0.54 }
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
                history: [{ t: 1704067200, p: 0.50 }]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history[0].timestamp).toBeGreaterThan(1704067200);
        expect(history[0].timestamp).toBeLessThanOrEqual(1704067200 * 1000 + 3600000);
    });

    it('should align timestamps to interval grid', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                history: [
                    { t: 1704067221, p: 0.50 }  // 00:00:21
                ]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        // Should snap to 00:00:00
        const expectedSnap = Math.floor(1704067221 / 3600) * 3600 * 1000;
        expect(history[0].timestamp).toBe(expectedSnap);
    });

    it('should respect limit parameter', async () => {
        const mockHistory = Array.from({ length: 100 }, (_, i) => ({
            t: 1704067200 + (i * 3600),
            p: 0.50 + (i * 0.001)
        }));

        mockedAxios.get.mockResolvedValue({
            data: { history: mockHistory }
        });

        const history = await exchange.fetchOHLCV('token123456789', {
            resolution: '1h',
            limit: 20
        });

        expect(history.length).toBe(20);
    });

    it('should map intervals to fidelity correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { history: [] }
        });

        await exchange.fetchOHLCV('token123456789', { resolution: '1m' });
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ fidelity: 1 })
            })
        );

        jest.clearAllMocks();
        mockedAxios.get.mockResolvedValue({ data: { history: [] } });

        await exchange.fetchOHLCV('token123456789', { resolution: '1d' });
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ fidelity: 1440 })
            })
        );
    });

    it('should handle start and end timestamps', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { history: [] }
        });

        const start = new Date('2025-01-01T00:00:00Z');
        const end = new Date('2025-01-02T00:00:00Z');

        await exchange.fetchOHLCV('token123456789', {
            resolution: '1h',
            start,
            end
        });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({
                    startTs: Math.floor(start.getTime() / 1000),
                    endTs: Math.floor(end.getTime() / 1000)
                })
            })
        );
    });

    it('should calculate smart lookback when start not provided', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { history: [] }
        });

        await exchange.fetchOHLCV('token123456789', {
            resolution: '1h',
            limit: 24
        });

        const call = mockedAxios.get.mock.calls[0][1];
        const params = call?.params;

        expect(params.startTs).toBeDefined();
        expect(params.endTs).toBeDefined();
        // Should be approximately 24 hours worth of data
        const duration = params.endTs - params.startTs;
        expect(duration).toBeGreaterThan(24 * 60 * 60 * 0.9);  // Allow 10% margin
        expect(duration).toBeLessThan(24 * 60 * 60 * 1.1);
    });

    it('should handle empty history array', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { history: [] }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history).toEqual([]);
    });

    it('should set OHLC to same value (synthetic candles)', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                history: [{ t: 1704067200, p: 0.52 }]
            }
        });

        const history = await exchange.fetchOHLCV('token123456789', { resolution: '1h' });

        expect(history[0].open).toBe(0.52);
        expect(history[0].high).toBe(0.52);
        expect(history[0].low).toBe(0.52);
        expect(history[0].close).toBe(0.52);
    });

    it('should throw error for invalid token ID format', async () => {
        await expect(exchange.fetchOHLCV('123', { resolution: '1h' }))
            .rejects
            .toThrow(/Invalid ID/i);
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

        await expect(exchange.fetchOHLCV('token123456789', { resolution: '1h' }))
            .rejects
            .toThrow(/History API Error/i);
    });
});
