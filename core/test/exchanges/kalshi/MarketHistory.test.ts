import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi fetchOHLCV() Test
 * 
 * What: Tests fetching historical OHLCV candlestick data.
 * Why: Historical data is essential for charting and analysis.
 * How: Mocks Kalshi candlestick API responses and verifies data transformation.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - fetchOHLCV', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should fetch and parse candlestick data', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                candlesticks: [
                    {
                        end_period_ts: 1704067200,
                        price: { open: 5200, high: 5300, low: 5100, close: 5250 },
                        volume: 1000
                    },
                    {
                        end_period_ts: 1704070800,
                        price: { open: 5250, high: 5400, low: 5200, close: 5350 },
                        volume: 1500
                    }
                ]
            }
        });

        const history = await exchange.fetchOHLCV('FED-25JAN-B4.75', { resolution: '1h' });

        expect(history.length).toBe(2);
        expect(history[0].open).toBe(52);  // 5200 / 100 = 52
        expect(history[0].high).toBe(53);
        expect(history[0].low).toBe(51);
        expect(history[0].close).toBe(52.5);
        expect(history[0].volume).toBe(1000);
    });

    it('should convert timestamps to milliseconds', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                candlesticks: [{
                    end_period_ts: 1704067200,
                    price: { open: 5000, high: 5000, low: 5000, close: 5000 },
                    volume: 100
                }]
            }
        });

        const history = await exchange.fetchOHLCV('TEST-MARKET-B5', { resolution: '1h' });

        expect(history[0].timestamp).toBe(1704067200 * 1000);
    });

    it('should respect limit parameter', async () => {
        const mockCandles = Array.from({ length: 100 }, (_, i) => ({
            end_period_ts: 1704067200 + (i * 3600),
            price: { open: 5000, high: 5000, low: 5000, close: 5000 },
            volume: 100
        }));

        mockedAxios.get.mockResolvedValue({
            data: { candlesticks: mockCandles }
        });

        const history = await exchange.fetchOHLCV('TEST-MARKET-B5', {
            resolution: '1h',
            limit: 20
        });

        expect(history.length).toBe(20);
    });

    it('should handle different intervals', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                candlesticks: [{
                    end_period_ts: 1704067200,
                    price: { open: 5000, high: 5000, low: 5000, close: 5000 },
                    volume: 100
                }]
            }
        });

        await exchange.fetchOHLCV('TEST-MARKET-B5', { resolution: '1m' });
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ period_interval: 1 })
            })
        );

        jest.clearAllMocks();
        mockedAxios.get.mockResolvedValue({
            data: { candlesticks: [] }
        });

        await exchange.fetchOHLCV('TEST-MARKET-B5', { resolution: '1d' });
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({ period_interval: 1440 })
            })
        );
    });

    it('should handle start and end timestamps', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { candlesticks: [] }
        });

        const start = new Date('2025-01-01T00:00:00Z');
        const end = new Date('2025-01-02T00:00:00Z');

        await exchange.fetchOHLCV('TEST-MARKET-B5', {
            resolution: '1h',
            start,
            end
        });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({
                    start_ts: Math.floor(start.getTime() / 1000),
                    end_ts: Math.floor(end.getTime() / 1000)
                })
            })
        );
    });

    it('should handle empty candlesticks array', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { candlesticks: [] }
        });

        const history = await exchange.fetchOHLCV('TEST-MARKET-B5', { resolution: '1h' });

        expect(history).toEqual([]);
    });

    it('should handle missing price fields gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                candlesticks: [{
                    end_period_ts: 1704067200,
                    price: {},  // Missing OHLC data
                    volume: 100
                }]
            }
        });

        const history = await exchange.fetchOHLCV('TEST-MARKET-B5', { resolution: '1h' });

        expect(history[0].open).toBe(0);
        expect(history[0].high).toBe(0);
        expect(history[0].low).toBe(0);
        expect(history[0].close).toBe(0);
    });

    it('should extract series ticker correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { candlesticks: [] }
        });

        await exchange.fetchOHLCV('FED-25JAN-B4.75', { resolution: '1h' });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('/series/FED-25JAN/markets/FED-25JAN-B4.75/'),
            expect.any(Object)
        );
    });
});
