import axios from 'axios';
import { KalshiExchange } from '../../src/exchanges/kalshi';
import { PolymarketExchange } from '../../src/exchanges/polymarket';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Helper to create a minimal Kalshi event+market response
function kalshiEvent(eventTicker: string, markets: { ticker: string; title: string }[]) {
    return {
        event_ticker: eventTicker,
        title: `Event ${eventTicker}`,
        category: 'test',
        markets: markets.map(m => ({
            ticker: m.ticker,
            title: m.title,
            yes_bid: 50,
            yes_ask: 52,
            no_bid: 48,
            no_ask: 50,
            volume: 1000,
            volume_24h: 100,
            open_interest: 500,
            liquidity: 200,
            expiration_time: '2026-12-31T00:00:00Z',
            rules_primary: '',
            result: '',
            can_close_early: false,
            candidate_name: '',
        })),
    };
}

// Helper to create a minimal Polymarket event+market response
function polymarketEvent(slug: string, markets: { id: string; question: string }[]) {
    return {
        slug,
        title: `Event ${slug}`,
        description: `Description for ${slug}`,
        markets: markets.map(m => ({
            id: m.id,
            question: m.question,
            description: '',
            outcomes: JSON.stringify(['Yes', 'No']),
            outcomePrices: JSON.stringify([0.55, 0.45]),
            clobTokenIds: JSON.stringify(['1111111111', '2222222222']),
            volume24hr: 100,
            volume: 1000,
            liquidity: 200,
            endDate: '2026-12-31T00:00:00Z',
        })),
    };
}

describe('Exact Match Search', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset Kalshi internal cache
        const { resetCache } = require('../../src/exchanges/kalshi/fetchMarkets');
        resetCache();
    });

    describe('Kalshi - ticker pattern detection', () => {
        const kalshi = new KalshiExchange();

        it('should prioritize exact event ticker match at top of results', async () => {
            const exactEvent = kalshiEvent('KXFEDCHAIRNOM-29', [
                { ticker: 'FED-29-WARSH', title: 'Kevin Warsh' },
                { ticker: 'FED-29-POWELL', title: 'Jerome Powell' },
            ]);
            const searchEvent = kalshiEvent('KXELECTION', [
                { ticker: 'ELECT-PRES', title: 'Presidential Election' },
            ]);

            mockedAxios.get.mockImplementation((url: string) => {
                // Exact match endpoint (event by ticker)
                if (url.includes('/events/KXFEDCHAIRNOM-29')) {
                    return Promise.resolve({ data: { event: exactEvent } });
                }
                // Default market list (for text search)
                if (url.includes('/events') && !url.includes('KXFEDCHAIRNOM')) {
                    return Promise.resolve({ data: { events: [searchEvent], cursor: null } });
                }
                // Series endpoint
                if (url.includes('/series')) {
                    return Promise.resolve({ data: { series: [] } });
                }
                return Promise.resolve({ data: { events: [], cursor: null } });
            });

            const results = await kalshi.fetchMarkets({ query: 'KXFEDCHAIRNOM-29' });

            expect(results.length).toBeGreaterThanOrEqual(2);
            // The exact match markets should appear first
            expect(results[0].marketId).toBe('FED-29-WARSH');
            expect(results[1].marketId).toBe('FED-29-POWELL');
        });

        it('should not attempt exact match for plain text queries', async () => {
            const searchEvent = kalshiEvent('KXELECTION', [
                { ticker: 'ELECT-PRES', title: 'Presidential Election' },
            ]);
            // Override the helper's default title to make it match our search query
            searchEvent.title = 'Presidential Election Winner';

            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('/series')) {
                    return Promise.resolve({ data: { series: [] } });
                }
                return Promise.resolve({ data: { events: [searchEvent], cursor: null } });
            });

            // Spaces disqualify the ticker pattern
            const results = await kalshi.fetchMarkets({ query: 'presidential election' });

            // Should NOT have called the event-specific endpoint
            const eventCalls = mockedAxios.get.mock.calls.filter(
                ([url]) => typeof url === 'string' && url.match(/\/events\/[A-Z]/)
            );
            expect(eventCalls).toHaveLength(0);

            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].title).toBe('Presidential Election Winner');
        });

        it('should gracefully handle exact match fetch failure', async () => {
            const searchEvent = kalshiEvent('KXOTHER', [
                { ticker: 'OTHER-MKT', title: 'Some Other Market' },
            ]);

            mockedAxios.get.mockImplementation((url: string) => {
                // Exact match fails (404)
                if (url.includes('/events/BADTICKER-99')) {
                    return Promise.reject(new Error('Not Found'));
                }
                if (url.includes('/series')) {
                    return Promise.resolve({ data: { series: [] } });
                }
                return Promise.resolve({ data: { events: [searchEvent], cursor: null } });
            });

            // Should not throw, should fall back to search results
            const results = await kalshi.fetchMarkets({ query: 'BADTICKER-99' });
            expect(results).toBeDefined();
        });

        it('should deduplicate when exact match overlaps with search results', async () => {
            const sharedMarket = { ticker: 'FED-29-WARSH', title: 'Kevin Warsh' };
            const exactEvent = kalshiEvent('KXFEDCHAIRNOM-29', [sharedMarket]);
            const searchEvent = kalshiEvent('KXFEDCHAIRNOM-29', [sharedMarket]);

            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('/events/KXFEDCHAIRNOM-29')) {
                    return Promise.resolve({ data: { event: exactEvent } });
                }
                if (url.includes('/series')) {
                    return Promise.resolve({ data: { series: [] } });
                }
                return Promise.resolve({ data: { events: [searchEvent], cursor: null } });
            });

            const results = await kalshi.fetchMarkets({ query: 'KXFEDCHAIRNOM-29' });

            // Should not have duplicates
            const ids = results.map(m => m.marketId);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });
    });

    describe('Polymarket - slug pattern detection', () => {
        const poly = new PolymarketExchange();

        it('should prioritize exact slug match at top of results', async () => {
            const exactEvent = polymarketEvent('who-will-trump-nominate-as-fed-chair', [
                { id: '100001', question: 'Kevin Warsh' },
                { id: '100002', question: 'Jerome Powell' },
            ]);
            const searchEvent = polymarketEvent('us-election-winner', [
                { id: '200001', question: 'Who will win?' },
            ]);

            mockedAxios.get.mockImplementation((url: string, config?: any) => {
                // Slug-based lookup
                if (config?.params?.slug === 'who-will-trump-nominate-as-fed-chair') {
                    return Promise.resolve({ data: [exactEvent] });
                }
                // Search endpoint
                if (url.includes('public-search')) {
                    return Promise.resolve({ data: [searchEvent] });
                }
                return Promise.resolve({ data: [] });
            });

            const results = await poly.fetchMarkets({ query: 'who-will-trump-nominate-as-fed-chair' });

            expect(results.length).toBeGreaterThanOrEqual(2);
            // Exact slug matches should be first
            expect(results[0].marketId).toBe('100001');
            expect(results[1].marketId).toBe('100002');
        });

        it('should not attempt exact match for plain text queries', async () => {
            const searchEvent = polymarketEvent('us-election', [
                { id: '300001', question: 'Election market' },
            ]);

            mockedAxios.get.mockImplementation((url: string) => {
                if (url.includes('public-search')) {
                    return Promise.resolve({ data: [searchEvent] });
                }
                return Promise.resolve({ data: [] });
            });

            const results = await poly.fetchMarkets({ query: 'trump election' });

            // Should NOT have called the slug-based endpoint (spaces disqualify slug pattern)
            const slugCalls = mockedAxios.get.mock.calls.filter(
                ([, config]) => config?.params?.slug
            );
            expect(slugCalls).toHaveLength(0);
        });

        it('should gracefully handle exact slug fetch failure', async () => {
            const searchEvent = polymarketEvent('some-event', [
                { id: '400001', question: 'Some market' },
            ]);

            mockedAxios.get.mockImplementation((url: string, config?: any) => {
                if (config?.params?.slug === 'nonexistent-slug-market') {
                    return Promise.reject(new Error('Not Found'));
                }
                if (url.includes('public-search')) {
                    return Promise.resolve({ data: [searchEvent] });
                }
                return Promise.resolve({ data: [] });
            });

            const results = await poly.fetchMarkets({ query: 'nonexistent-slug-market' });
            expect(results).toBeDefined();
        });

        it('should deduplicate when slug match overlaps with search results', async () => {
            const event = polymarketEvent('fed-chair-market', [
                { id: '500001', question: 'Fed Chair' },
            ]);

            mockedAxios.get.mockImplementation((url: string, config?: any) => {
                if (config?.params?.slug === 'fed-chair-market') {
                    return Promise.resolve({ data: [event] });
                }
                if (url.includes('public-search')) {
                    return Promise.resolve({ data: [event] });
                }
                return Promise.resolve({ data: [] });
            });

            const results = await poly.fetchMarkets({ query: 'fed-chair-market' });

            const ids = results.map(m => m.marketId);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });
    });
});
