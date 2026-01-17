import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket getMarketsBySlug() Test
 * 
 * What: Tests fetching specific markets by their event slug (from URL).
 * Why: This is a CRITICAL user-facing feature for deep-linking to specific events.
 * How: Mocks Gamma API responses for slug-based queries and verifies data extraction.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - getMarketsBySlug', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should fetch markets by slug successfully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'fed-rate-decision',
                title: 'Federal Reserve Rate Decision',
                description: 'Will the Fed cut rates?',
                markets: [{
                    id: 'market-1',
                    question: 'Rate cut in March?',
                    description: 'Federal Reserve rate decision',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-03-31T00:00:00Z',
                    volume24hr: '100000',
                    volume: '500000',
                    liquidity: '50000'
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('fed-rate-decision');

        expect(markets.length).toBe(1);
        expect(markets[0].id).toBe('market-1');
        expect(markets[0].title).toBe('Federal Reserve Rate Decision - Rate cut in March?');
        expect(markets[0].outcomes.length).toBe(2);
    });

    it('should handle empty events array', async () => {
        mockedAxios.get.mockResolvedValue({
            data: []
        });

        const markets = await exchange.getMarketsBySlug('nonexistent-slug');

        expect(markets).toEqual([]);
    });

    it('should handle null events', async () => {
        mockedAxios.get.mockResolvedValue({
            data: null
        });

        const markets = await exchange.getMarketsBySlug('invalid-slug');

        expect(markets).toEqual([]);
    });

    it('should skip events without markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test-event',
                title: 'Test Event'
                // Missing markets field
            }]
        });

        const markets = await exchange.getMarketsBySlug('test-event');

        expect(markets).toEqual([]);
    });

    it('should handle candidate name extraction', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'election-2024',
                title: 'Presidential Election',
                markets: [{
                    id: 'market-1',
                    question: 'Will Trump win?',
                    groupItemTitle: 'Trump',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.48", "0.52"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2024-11-05T00:00:00Z',
                    volume24hr: '1000000'
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('election-2024');

        expect(markets[0].outcomes[0].label).toBe('Trump');
        expect(markets[0].outcomes[1].label).toBe('Not Trump');
    });

    it('should fallback to question for candidate name', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test',
                markets: [{
                    id: 'market-1',
                    question: 'Biden',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '10000'
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].outcomes[0].label).toBe('Biden');
    });

    it('should handle JSON parsing errors gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '{invalid json}',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '10000'
                }]
            }]
        });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        const markets = await exchange.getMarketsBySlug('test');

        expect(consoleSpy).toHaveBeenCalled();
        expect(markets[0].outcomes.length).toBe(0);
        consoleSpy.mockRestore();
    });

    it('should handle price change data', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '10000',
                    oneDayPriceChange: 0.05
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].outcomes[0].priceChange24h).toBe(0.05);
    });

    it('should handle missing endDate with fallback', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    volume24hr: '10000'
                    // Missing endDate
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].resolutionDate).toBeInstanceOf(Date);
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
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test',
                image: 'https://example.com/image.jpg',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '10000'
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].image).toBe('https://example.com/image.jpg');
    });

    it('should handle volume field variations', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume_24h: '25000',  // Alternative field name
                    volume: '100000'
                }]
            }]
        });

        const markets = await exchange.getMarketsBySlug('test');

        expect(markets[0].volume24h).toBe(25000);
        expect(markets[0].volume).toBe(100000);
    });
});
