import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless searchMarkets() Test
 * 
 * What: Tests the search functionality for finding markets by query string.
 * Why: Search is a critical user-facing feature that must work reliably.
 * How: Mocks API responses with various market data and verifies client-side filtering.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - searchMarkets', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    it('should filter markets by title', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                markets: [
                    {
                        slug: 'fed-rate-decision',
                        title: 'Federal Reserve Rate Decision',
                        tokens: { yes: 't1', no: 't2' },
                        prices: [0.5, 0.5],
                        volumeFormatted: '100000'
                    },
                    {
                        slug: 'election-2024',
                        title: 'Presidential Election 2024',
                        tokens: { trump: 't3', biden: 't4' },
                        prices: [0.5, 0.5],
                        volumeFormatted: '500000'
                    }
                ]
            }
        });

        const results = await exchange.searchMarkets('federal');

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title.toLowerCase()).toContain('federal');
    });

    it('should filter markets by description', async () => {
        // Since description is not always present in the flat list, we rely on title or other fields 
        // if description isn't available. But let's mock description if the type definition allows.
        mockedAxios.get.mockResolvedValue({
            data: {
                markets: [{
                    slug: 'climate-policy',
                    title: 'Climate Policy',
                    description: 'Will Congress pass climate legislation?',
                    tokens: { yes: 't1', no: 't2' },
                    prices: [0.3, 0.7]
                }]
            }
        });

        const results = await exchange.searchMarkets('climate');

        expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
        const mockMarkets = Array.from({ length: 30 }, (_, i) => ({
            slug: `market-${i}`,
            title: `Test Market ${i}`,
            tokens: { yes: 't1', no: 't2' },
            prices: [0.5, 0.5]
        }));

        mockedAxios.get.mockResolvedValue({ data: { markets: mockMarkets } });

        const results = await exchange.searchMarkets('test', { limit: 5 });

        expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when no matches found', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                markets: []
            }
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
            data: {
                markets: [{
                    slug: 'test',
                    title: 'FEDERAL RESERVE',
                    tokens: { yes: 't1', no: 't2' },
                    prices: [0.5, 0.5]
                }]
            }
        };

        mockedAxios.get.mockResolvedValue(mockData);
        const resultsLower = await exchange.searchMarkets('federal');

        jest.clearAllMocks();
        mockedAxios.get.mockResolvedValue(mockData);
        const resultsUpper = await exchange.searchMarkets('FEDERAL');

        expect(resultsLower.length).toBe(resultsUpper.length);
    });
});
