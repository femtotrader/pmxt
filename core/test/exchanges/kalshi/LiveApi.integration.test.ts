import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi Integration Test (Live API)
 * 
 * What: Verifies real-world connectivity and data structure from the live Kalshi API.
 * Why: To ensure our mapping logic matches the actual live data and to detect 
 *      breaking API changes early.
 * How: Makes actual HTTP requests to Kalshi's public endpoints and validates 
 *      the properties of the returned markets.
 */

describe('KalshiExchange - Live API Integration', () => {
    const exchange = new KalshiExchange();
    jest.setTimeout(60000); // Kalshi fetches all events before applying limit (needs optimization)

    it('should fetch real markets with expected properties', async () => {
        const markets = await exchange.fetchMarkets({ limit: 5 });

        if (markets.length > 0) {
            const m = markets[0];
            expect(m.id).toBeDefined();
            expect(typeof m.title).toBe('string');
            expect(m.outcomes.length).toBeGreaterThan(0);
            expect(m.volume24h).toBeGreaterThanOrEqual(0);

            // Prices should be normalized to 0-1
            m.outcomes.forEach(outcome => {
                expect(outcome.price).toBeGreaterThanOrEqual(0);
                expect(outcome.price).toBeLessThanOrEqual(1);
            });
        }
    });

    it('should respect the limit parameter on live data', async () => {
        const limit = 3;
        const markets = await exchange.fetchMarkets({ limit });
        expect(markets.length).toBeLessThanOrEqual(limit);
    });
});
