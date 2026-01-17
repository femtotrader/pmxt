import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket fetchTrades() Test
 * 
 * What: Tests fetching raw trade history data from CLOB API.
 * Why: Trade history is CRITICAL for market analysis and price discovery.
 * How: Mocks CLOB trades API responses and verifies data transformation.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - fetchTrades', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should fetch and parse trade history', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'trade-1',
                    timestamp: 1704067200,
                    price: '0.52',
                    size: '100',
                    side: 'BUY'
                },
                {
                    id: 'trade-2',
                    timestamp: 1704067260,
                    price: '0.53',
                    size: '250',
                    side: 'SELL'
                }
            ]
        });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades.length).toBe(2);
        expect(trades[0].id).toBe('trade-1');
        expect(trades[0].price).toBe(0.52);
        expect(trades[0].amount).toBe(100);
        expect(trades[0].side).toBe('buy');
    });

    it('should convert timestamps to milliseconds', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'trade-1',
                timestamp: 1704067200,
                price: '0.50',
                size: '100',
                side: 'BUY'
            }]
        });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades[0].timestamp).toBe(1704067200 * 1000);
    });

    it('should handle BUY and SELL sides correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                { id: 'trade-1', timestamp: 1704067200, price: '0.50', size: '100', side: 'BUY' },
                { id: 'trade-2', timestamp: 1704067260, price: '0.51', size: '150', side: 'SELL' }
            ]
        });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades[0].side).toBe('buy');
        expect(trades[1].side).toBe('sell');
    });

    it('should handle unknown side values', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'trade-1',
                timestamp: 1704067200,
                price: '0.50',
                size: '100',
                side: 'UNKNOWN'
            }]
        });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades[0].side).toBe('unknown');
    });

    it('should handle missing trade ID with fallback', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                timestamp: 1704067200,
                price: '0.50',
                size: '100',
                side: 'BUY'
                // Missing id
            }]
        });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades[0].id).toBe('1704067200-0.50');
    });

    it('should handle alternative amount field names', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'trade-1',
                timestamp: 1704067200,
                price: '0.50',
                amount: '200',  // Alternative field
                side: 'BUY'
            }]
        });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades[0].amount).toBe(200);
    });

    it('should respect limit parameter', async () => {
        const mockTrades = Array.from({ length: 100 }, (_, i) => ({
            id: `trade-${i}`,
            timestamp: 1704067200 + i,
            price: '0.50',
            size: '100',
            side: 'BUY'
        }));

        mockedAxios.get.mockResolvedValue({ data: mockTrades });

        const trades = await exchange.fetchTrades('token123456789', {
            resolution: '1h',
            limit: 20
        });

        expect(trades.length).toBe(20);
    });

    it('should include start timestamp in query params', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] });

        const start = new Date('2025-01-01T00:00:00Z');
        await exchange.fetchTrades('token123456789', {
            resolution: '1h',
            start
        });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({
                    after: Math.floor(start.getTime() / 1000)
                })
            })
        );
    });

    it('should include end timestamp in query params', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] });

        const end = new Date('2025-01-31T00:00:00Z');
        await exchange.fetchTrades('token123456789', {
            resolution: '1h',
            end
        });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                params: expect.objectContaining({
                    before: Math.floor(end.getTime() / 1000)
                })
            })
        );
    });

    it('should handle empty trades array', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] });

        const trades = await exchange.fetchTrades('token123456789', { resolution: '1h' });

        expect(trades).toEqual([]);
    });

    it('should throw error for invalid token ID format', async () => {
        await expect(exchange.fetchTrades('123', { resolution: '1h' }))
            .rejects
            .toThrow(/Invalid ID/i);
    });

    it('should handle API errors with detailed messages', async () => {
        const error = {
            response: {
                status: 401,
                data: { error: 'Authentication required' }
            },
            isAxiosError: true
        };
        mockedAxios.get.mockRejectedValue(error);
        // @ts-expect-error - Mock type mismatch is expected in tests
        mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

        await expect(exchange.fetchTrades('token123456789', { resolution: '1h' }))
            .rejects
            .toThrow(/Trades API Error/i);
    });

    it('should handle unexpected errors', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Network failure'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        await expect(exchange.fetchTrades('token123456789', { resolution: '1h' }))
            .rejects
            .toThrow('Network failure');

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should return most recent trades when limit is applied', async () => {
        const mockTrades = [
            { id: 'trade-1', timestamp: 1704067200, price: '0.50', size: '100', side: 'BUY' },
            { id: 'trade-2', timestamp: 1704067260, price: '0.51', size: '100', side: 'BUY' },
            { id: 'trade-3', timestamp: 1704067320, price: '0.52', size: '100', side: 'BUY' }
        ];

        mockedAxios.get.mockResolvedValue({ data: mockTrades });

        const trades = await exchange.fetchTrades('token123456789', {
            resolution: '1h',
            limit: 2
        });

        expect(trades.length).toBe(2);
        expect(trades[0].id).toBe('trade-2');  // Most recent 2
        expect(trades[1].id).toBe('trade-3');
    });
});
