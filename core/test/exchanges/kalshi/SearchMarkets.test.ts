import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';
import { resetCache } from '../../../src/exchanges/kalshi/fetchMarkets';

/**
 * Kalshi searchMarkets() Test
 * 
 * What: Tests the search functionality for finding markets by query string.
 * Why: Search is a critical user-facing feature that must work reliably.
 * How: Mocks API responses with various market data and verifies filtering logic.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - searchMarkets', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
        resetCache(); // Clear the cache to ensure test isolation
    });

    it('should filter markets by title', async () => {
        mockedAxios.get.mockImplementation((url: string) => {
            if (url.includes('/series')) {
                return Promise.resolve({ data: { series: [] } });
            }
            return Promise.resolve({
                data: {
                    events: [
                        {
                            event_ticker: 'FED-2025',
                            title: 'Federal Reserve Interest Rate Decision',
                            markets: [{
                                ticker: 'FED-25JAN-B4.75',
                                expiration_time: '2025-01-29T00:00:00Z',
                                last_price: 5200
                            }]
                        },
                        {
                            event_ticker: 'PRES-2024',
                            title: 'Presidential Election 2024',
                            markets: [{
                                ticker: 'PRES-2024-TRUMP',
                                expiration_time: '2024-11-05T00:00:00Z',
                                last_price: 4800
                            }]
                        }
                    ],
                    cursor: null
                }
            });
        });

        const results = await exchange.searchMarkets('federal');

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title.toLowerCase()).toContain('federal');
    });

    it('should filter markets by description when searchIn is set to description', async () => {
        // Mock both API calls: events and series
        mockedAxios.get.mockImplementation((url: string) => {
            if (url.includes('/series')) {
                return Promise.resolve({ data: { series: [] } });
            }
            return Promise.resolve({
                data: {
                    events: [
                        {
                            event_ticker: 'TEST-EVENT',
                            title: 'Test Event',
                            sub_title: 'This is about climate change policy',
                            markets: [{
                                ticker: 'TEST-MARKET',
                                subtitle: 'Climate policy details',
                                rules_primary: 'This is about climate change policy',
                                expiration_time: '2025-12-31T00:00:00Z',
                                last_price: 5000
                            }]
                        }
                    ],
                    cursor: null
                }
            });
        });

        const results = await exchange.searchMarkets('climate', { searchIn: 'description' });

        expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
        const mockEvents = Array.from({ length: 50 }, (_, i) => ({
            event_ticker: `EVENT-${i}`,
            title: `Test Market ${i}`,
            markets: [{
                ticker: `MARKET-${i}`,
                expiration_time: '2025-12-31T00:00:00Z',
                last_price: 5000
            }]
        }));

        mockedAxios.get.mockImplementation((url: string) => {
            if (url.includes('/series')) {
                return Promise.resolve({ data: { series: [] } });
            }
            return Promise.resolve({
                data: {
                    events: mockEvents,
                    cursor: null
                }
            });
        });

        const results = await exchange.searchMarkets('test', { limit: 5 });

        expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array when no matches found', async () => {
        mockedAxios.get.mockImplementation((url: string) => {
            if (url.includes('/series')) {
                return Promise.resolve({ data: { series: [] } });
            }
            return Promise.resolve({
                data: {
                    events: [{
                        event_ticker: 'UNRELATED',
                        title: 'Completely Different Topic',
                        markets: [{
                            ticker: 'UNRELATED-MARKET',
                            expiration_time: '2025-12-31T00:00:00Z',
                            last_price: 5000
                        }]
                    }],
                    cursor: null
                }
            });
        });

        const results = await exchange.searchMarkets('nonexistent query string');

        expect(results).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        mockedAxios.get.mockRejectedValue(new Error('Search failed'));

        const results = await exchange.searchMarkets('test');

        expect(results).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should be case-insensitive', async () => {
        mockedAxios.get.mockImplementation((url: string) => {
            if (url.includes('/series')) {
                return Promise.resolve({ data: { series: [] } });
            }
            return Promise.resolve({
                data: {
                    events: [{
                        event_ticker: 'TEST',
                        title: 'FEDERAL RESERVE',
                        markets: [{
                            ticker: 'TEST-MARKET',
                            expiration_time: '2025-12-31T00:00:00Z',
                            last_price: 5000
                        }]
                    }],
                    cursor: null
                }
            });
        });

        const resultsLower = await exchange.searchMarkets('federal');

        jest.clearAllMocks();
        mockedAxios.get.mockImplementation((url: string) => {
            if (url.includes('/series')) {
                return Promise.resolve({ data: { series: [] } });
            }
            return Promise.resolve({
                data: {
                    events: [{
                        event_ticker: 'TEST',
                        title: 'FEDERAL RESERVE',
                        markets: [{
                            ticker: 'TEST-MARKET',
                            expiration_time: '2025-12-31T00:00:00Z',
                            last_price: 5000
                        }]
                    }],
                    cursor: null
                }
            });
        });

        const resultsUpper = await exchange.searchMarkets('FEDERAL');

        expect(resultsLower.length).toBe(resultsUpper.length);
    });
});
