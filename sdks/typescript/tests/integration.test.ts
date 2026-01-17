/**
 * TypeScript SDK Integration Tests
 *
 * These tests verify that the TypeScript SDK correctly communicates with the PMXT server
 * and returns properly structured, validated data.
 *
 * Prerequisites:
 * - PMXT server must be running (use pmxt-ensure-server)
 * - No API keys required for read-only operations
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { Polymarket, Kalshi } from '../index';

describe('Polymarket Integration', () => {
    let client: Polymarket;

    beforeAll(() => {
        client = new Polymarket();
    });

    test('fetchMarkets returns valid structure', async () => {
        const markets = await client.fetchMarkets();

        expect(Array.isArray(markets)).toBe(true);
        expect(markets.length).toBeGreaterThan(0);

        const market = markets[0];
        expect(market).toHaveProperty('id');
        expect(market).toHaveProperty('title');
        expect(market).toHaveProperty('outcomes');
        expect(market).toHaveProperty('volume24h');

        expect(typeof market.id).toBe('string');
        expect(typeof market.title).toBe('string');
        expect(Array.isArray(market.outcomes)).toBe(true);
        expect(market.outcomes.length).toBeGreaterThan(0);
    });

    test('market outcomes have required fields', async () => {
        const markets = await client.fetchMarkets();
        const outcome = markets[0].outcomes[0];

        expect(outcome).toHaveProperty('label');
        expect(outcome).toHaveProperty('price');
        expect(typeof outcome.label).toBe('string');
        expect(typeof outcome.price).toBe('number');
        expect(outcome.price).toBeGreaterThanOrEqual(0);
        expect(outcome.price).toBeLessThanOrEqual(1);
    });

    test('getMarketsBySlug returns valid data', async () => {
        const markets = await client.getMarketsBySlug('presidential-election-winner-2024');

        expect(Array.isArray(markets)).toBe(true);

        if (markets.length > 0) {
            const market = markets[0];
            expect(market).toHaveProperty('id');
            expect(market).toHaveProperty('outcomes');
        }
    });

    test('volume fields are numeric', async () => {
        const markets = await client.fetchMarkets();
        const market = markets[0];

        expect(typeof market.volume24h).toBe('number');
        expect(market.volume24h).toBeGreaterThanOrEqual(0);
    });

    test('resolution date is properly typed', async () => {
        const markets = await client.fetchMarkets();
        const market = markets[0];

        if (market.resolutionDate) {
            expect(market.resolutionDate instanceof Date || typeof market.resolutionDate === 'string').toBe(true);
        }
    });
});

describe('Kalshi Integration', () => {
    let client: Kalshi;

    beforeAll(() => {
        client = new Kalshi();
    });

    test('fetchMarkets returns valid structure', async () => {
        const markets = await client.fetchMarkets();

        expect(Array.isArray(markets)).toBe(true);
        expect(markets.length).toBeGreaterThan(0);

        const market = markets[0];
        expect(market).toHaveProperty('id');
        expect(market).toHaveProperty('title');
        expect(market).toHaveProperty('outcomes');
    });

    test('market outcomes are properly structured', async () => {
        const markets = await client.fetchMarkets();
        const market = markets[0];

        expect(Array.isArray(market.outcomes)).toBe(true);
        expect(market.outcomes.length).toBeGreaterThan(0);

        const outcome = market.outcomes[0];
        expect(outcome).toHaveProperty('label');
        expect(outcome).toHaveProperty('price');
    });
});

describe('Cross-Exchange Consistency', () => {
    test('both exchanges return same structure', async () => {
        const poly = new Polymarket();
        const kalshi = new Kalshi();

        const polyMarkets = await poly.fetchMarkets();
        const kalshiMarkets = await kalshi.fetchMarkets();

        expect(Array.isArray(polyMarkets)).toBe(true);
        expect(Array.isArray(kalshiMarkets)).toBe(true);

        if (polyMarkets.length > 0 && kalshiMarkets.length > 0) {
            const polyMarket = polyMarkets[0];
            const kalshiMarket = kalshiMarkets[0];

            const coreFields = ['id', 'title', 'outcomes'];
            coreFields.forEach(field => {
                expect(polyMarket).toHaveProperty(field);
                expect(kalshiMarket).toHaveProperty(field);
            });
        }
    });
});
