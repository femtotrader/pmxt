import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket searchMarkets() Test
 * 
 * What: Tests the search functionality for finding markets by query string.
 * Why: Search is a critical user-facing feature that must work reliably.
 * How: Mocks API responses with various market data and verifies client-side filtering.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - searchMarkets', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should filter markets by title', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'event-1',
                    slug: 'fed-rate-decision',
                    title: 'Federal Reserve Rate Decision',
                    description: 'Federal Reserve interest rate decision',
                    markets: [{
                        id: 'market-1',
                        question: 'Will rates be cut?',
                        description: 'Federal Reserve rate cut prediction',
                        outcomes: '["Yes", "No"]',
                        outcomePrices: '["0.52", "0.48"]',
                        clobTokenIds: '["token1", "token2"]',
                        endDate: '2025-12-31T00:00:00Z',
                        volume24hr: '100000'
                    }]
                },
                {
                    id: 'event-2',
                    slug: 'election-2024',
                    title: 'Presidential Election 2024',
                    description: 'US Presidential Election',
                    markets: [{
                        id: 'market-2',
                        question: 'Winner?',
                        description: 'Election winner prediction',
                        outcomes: '["Trump", "Biden"]',
                        outcomePrices: '["0.48", "0.52"]',
                        clobTokenIds: '["token3", "token4"]',
                        endDate: '2024-11-05T00:00:00Z',
                        volume24hr: '500000'
                    }]
                }
            ]
        });

        const results = await exchange.searchMarkets('federal');

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title.toLowerCase()).toContain('federal');
    });

    it('should filter markets by description', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'climate-policy',
                title: 'Climate Policy',
                description: 'Will Congress pass climate legislation?',
                markets: [{
                    id: 'market-1',
                    question: 'Pass by 2025?',
                    description: 'Detailed climate change policy information',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.30", "0.70"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '50000'
                }]
            }]
        });

        const results = await exchange.searchMarkets('climate');

        expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
        const mockEvents = Array.from({ length: 30 }, (_, i) => ({
            id: `event-${i}`,
            slug: `test-event-${i}`,
            title: `Test Market ${i}`,
            markets: [{
                id: `market-${i}`,
                question: 'Test question',
                outcomes: '["Yes", "No"]',
                outcomePrices: '["0.50", "0.50"]',
                clobTokenIds: '["token1", "token2"]',
                endDate: '2025-12-31T00:00:00Z',
                volume24hr: '10000'
            }]
        }));

        mockedAxios.get.mockResolvedValue({ data: mockEvents });

        const results = await exchange.searchMarkets('test', { limit: 5 });

        expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when no matches found', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'unrelated',
                title: 'Completely Different Topic',
                markets: [{
                    id: 'market-1',
                    question: 'Something else',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '10000'
                }]
            }]
        });

        const results = await exchange.searchMarkets('nonexistent query string');

        expect(results).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Search failed'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const results = await exchange.searchMarkets('test');

        expect(results).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should be case-insensitive', async () => {
        const mockData = {
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'FEDERAL RESERVE',
                markets: [{
                    id: 'market-1',
                    question: 'Test',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.50", "0.50"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '10000'
                }]
            }]
        };

        mockedAxios.get.mockResolvedValue(mockData);
        const resultsLower = await exchange.searchMarkets('federal');

        jest.clearAllMocks();
        mockedAxios.get.mockResolvedValue(mockData);
        const resultsUpper = await exchange.searchMarkets('FEDERAL');

        expect(resultsLower.length).toBe(resultsUpper.length);
    });
});
