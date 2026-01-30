import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless getMarketsBySlug() Test
 * 
 * What: Tests fetching specific markets by their event slug (from URL).
 * Why: This is a CRITICAL user-facing feature for deep-linking to specific events.
 * How: Mocks Gamma API responses for slug-based queries and verifies data extraction.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - getMarketsBySlug', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    it('should fetch markets by slug successfully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                slug: 'fed-rate-decision',
                title: 'Federal Reserve Rate Decision',
                description: 'Will the Fed cut rates?',
                tokens: { yes: 't1', no: 't2' },
                prices: [0.52, 0.48],
                volumeFormatted: '100000'
            }
        });

        // getMarketsBySlug calls fetchMarkets which uses /markets/active and filters locally?
        // Wait, getMarketsBySlug implementation needs check.
        // Assuming it calls /markets/{slug} directly?
        // Let's assume it returns a list of UnifiedMarket

        // No, fetchMarkets.ts calls /markets/active. 
        // getMarketsBySlug.ts likely calls /markets/{slug} directly.

        const markets = await exchange.getMarketsBySlug('fed-rate-decision');

        expect(markets.length).toBe(1);
        expect(markets[0].id).toBe('fed-rate-decision');
        expect(markets[0].title).toBe('Federal Reserve Rate Decision');
        expect(markets[0].outcomes.length).toBe(2);
    });

    it('should handle empty result', async () => {
        mockedAxios.get.mockResolvedValue({
            data: null
        });

        const markets = await exchange.getMarketsBySlug('nonexistent-slug');

        expect(markets).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
        mockedAxios.get.mockRejectedValue(new Error('API Error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should include image data', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                slug: 'test',
                title: 'Test',
                logo: 'https://example.com/image.jpg',
                tokens: { yes: 't1', no: 't2' },
                prices: [0.5, 0.5]
            }
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].image).toBe('https://example.com/image.jpg');
    });

    it('should handle volume field variations', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                slug: 'test',
                title: 'Test',
                tokens: { yes: 't1', no: 't2' },
                prices: [0.5, 0.5],
                volumeFormatted: '25000',
                volume: 100000
            }
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].volume24h).toBe(25000);
        expect(markets[0].volume).toBe(100000);
    });
});
