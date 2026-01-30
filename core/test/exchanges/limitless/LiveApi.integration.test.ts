import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless Integration Test (Live API)
 * 
 * What: Verifies real-world connectivity and data structure from Limitless's Gamma API.
 * Why: Limitless data is complex and frequently changes; live tests catch schema drift.
 * How: Makes actual HTTP requests to Limitless and validates the properties 
 *      of the returned UnifiedMarket objects.
 */

describe('LimitlessExchange - Live API Integration', () => {
    const exchange = new LimitlessExchange();
    jest.setTimeout(15000);

    it('should fetch real active markets with correct schema', async () => {
        const markets = await exchange.fetchMarkets({ limit: 5 });

        expect(markets.length).toBeGreaterThan(0);

        const m = markets[0];
        expect(m.id).toBeDefined();
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.outcomes.length).toBeGreaterThanOrEqual(2);
        expect(m.url).toContain('limitless.exchange');
        expect(m.resolutionDate).toBeInstanceOf(Date);
    });

    it('should support pagination on live API', async () => {
        const page1 = await exchange.fetchMarkets({ limit: 1, offset: 0 });
        const page2 = await exchange.fetchMarkets({ limit: 1, offset: 1 });

        if (page1.length > 0 && page2.length > 0) {
            expect(page1[0].id).not.toBe(page2[0].id);
        }
    });

    it('should return top markets with non-zero volume', async () => {
        const markets = await exchange.fetchMarkets({ limit: 3, sort: 'volume' });
        if (markets.length > 0) {
            expect(markets[0].volume24h).toBeGreaterThan(0);
        }
    });
});
