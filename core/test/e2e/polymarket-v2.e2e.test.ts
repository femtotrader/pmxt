/**
 * Polymarket CLOB V2 — Core E2E Tests
 *
 * Tests the core PolymarketExchange class directly against Polymarket APIs.
 * No sidecar server needed. Validates the V2 migration end-to-end:
 *
 *   PolymarketExchange → @polymarket/clob-client-v2 → Polymarket CLOB API
 *
 * Read-only tests: always run (no credentials needed).
 * Auth tests:      run when POLYMARKET_PRIVATE_KEY is set.
 *
 * Run:
 *   npx jest test/e2e/polymarket-v2.e2e.test.ts --no-coverage
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

// Cloudflare can throttle Gamma API requests; allow generous timeouts.
const LONG_TIMEOUT = 180_000;

let PolymarketExchange: any;
let exchange: any;
let sampleOutcomeId: string;
let sampleMarketId: string;

beforeAll(async () => {
    // Dynamic import to avoid Babel issues with the V2 SDK
    const mod = await import('../../src/exchanges/polymarket/index');
    PolymarketExchange = mod.PolymarketExchange;
    exchange = new PolymarketExchange();

    // Grab a liquid market for downstream tests
    const markets = await exchange.fetchMarkets({ sort: 'volume', limit: 1 });
    expect(markets.length).toBeGreaterThan(0);
    sampleMarketId = markets[0].marketId;

    const outcome = markets[0].outcomes?.[0];
    expect(outcome).toBeDefined();
    sampleOutcomeId = outcome.outcomeId;
}, LONG_TIMEOUT);

// ---------------------------------------------------------------------------
// Market discovery (Gamma API)
// ---------------------------------------------------------------------------

describe('V2 Core: Market Discovery', () => {
    test('fetchMarkets with query', async () => {
        const markets = await exchange.fetchMarkets({ query: 'Bitcoin', limit: 3 });

        expect(markets.length).toBeGreaterThan(0);
        const m = markets[0];
        expect(typeof m.marketId).toBe('string');
        expect(typeof m.title).toBe('string');
        expect(Array.isArray(m.outcomes)).toBe(true);
        expect(m.outcomes.length).toBeGreaterThanOrEqual(2);

        const o = m.outcomes[0];
        expect(typeof o.outcomeId).toBe('string');
        expect(typeof o.price).toBe('number');
        expect(o.price).toBeGreaterThanOrEqual(0);
        expect(o.price).toBeLessThanOrEqual(1);
    }, LONG_TIMEOUT);

    test('fetchMarkets by marketId', async () => {
        const markets = await exchange.fetchMarkets({ marketId: sampleMarketId });

        expect(markets.length).toBe(1);
        expect(markets[0].marketId).toBe(sampleMarketId);
    }, LONG_TIMEOUT);

    test('fetchEvents with query', async () => {
        const events = await exchange.fetchEvents({ query: 'election', limit: 2 });

        expect(events.length).toBeGreaterThan(0);
        const ev = events[0];
        expect(typeof ev.id).toBe('string');
        expect(typeof ev.title).toBe('string');
        expect(Array.isArray(ev.markets)).toBe(true);
    }, LONG_TIMEOUT);
});

// ---------------------------------------------------------------------------
// CLOB read paths (exercise V2 backend)
// ---------------------------------------------------------------------------

describe('V2 Core: CLOB Read Paths', () => {
    test('fetchOrderBook returns bids/asks', async () => {
        const book = await exchange.fetchOrderBook(sampleOutcomeId);

        expect(book).toHaveProperty('bids');
        expect(book).toHaveProperty('asks');
        expect(Array.isArray(book.bids)).toBe(true);
        expect(Array.isArray(book.asks)).toBe(true);
        expect(typeof book.timestamp).toBe('number');

        // At least one side should have depth on a liquid market
        const totalLevels = book.bids.length + book.asks.length;
        expect(totalLevels).toBeGreaterThan(0);

        if (book.bids.length > 0) {
            expect(typeof book.bids[0].price).toBe('number');
            expect(typeof book.bids[0].size).toBe('number');
            expect(book.bids[0].price).toBeGreaterThan(0);
            expect(book.bids[0].price).toBeLessThanOrEqual(1);
        }
    }, LONG_TIMEOUT);

    test('fetchTrades returns valid trades', async () => {
        const trades = await exchange.fetchTrades(sampleOutcomeId, { limit: 5 });

        expect(Array.isArray(trades)).toBe(true);
        if (trades.length > 0) {
            const t = trades[0];
            expect(typeof t.id).toBe('string');
            expect(typeof t.price).toBe('number');
            expect(typeof t.amount).toBe('number');
            expect(typeof t.timestamp).toBe('number');
            expect(['buy', 'sell', 'unknown']).toContain(t.side);
            expect(t.timestamp).toBeGreaterThan(1600000000000); // after 2020
        }
    }, LONG_TIMEOUT);

    test('fetchOHLCV returns candle data', async () => {
        const candles = await exchange.fetchOHLCV(sampleOutcomeId, {
            resolution: '1d',
            limit: 5,
        });

        expect(Array.isArray(candles)).toBe(true);
        expect(candles.length).toBeGreaterThan(0);

        const c = candles[0];
        expect(typeof c.timestamp).toBe('number');
        expect(typeof c.open).toBe('number');
        expect(typeof c.high).toBe('number');
        expect(typeof c.low).toBe('number');
        expect(typeof c.close).toBe('number');
        expect(c.high).toBeGreaterThanOrEqual(c.low);
    }, LONG_TIMEOUT);
});

// ---------------------------------------------------------------------------
// V2-specific: ClobClient version detection
// ---------------------------------------------------------------------------

describe('V2 Core: Version Detection', () => {
    test('V2 SDK ClobClient can be constructed with options object', async () => {
        // This validates the V2 constructor change (positional → options) works
        const { ClobClient } = await import('@polymarket/clob-client-v2');
        const client = new ClobClient({
            host: 'https://clob.polymarket.com',
            chain: 137,
        });
        expect(client).toBeDefined();

        // getVersion() should return a version number from the CLOB API
        const version = await client.getVersion();
        expect(typeof version).toBe('number');
    }, LONG_TIMEOUT);

    test('V2 SDK exports expected enums', async () => {
        const { Side, AssetType, Chain, SignatureTypeV2 } =
            await import('@polymarket/clob-client-v2');

        expect(Side.BUY).toBe('BUY');
        expect(Side.SELL).toBe('SELL');
        expect(AssetType.COLLATERAL).toBe('COLLATERAL');
        expect(AssetType.CONDITIONAL).toBe('CONDITIONAL');
        expect(Chain.POLYGON).toBe(137);
        expect(SignatureTypeV2.EOA).toBe(0);
        expect(SignatureTypeV2.POLY_PROXY).toBe(1);
        expect(SignatureTypeV2.POLY_GNOSIS_SAFE).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Authenticated paths (POLYMARKET_PRIVATE_KEY required)
// ---------------------------------------------------------------------------

const privateKey = process.env.POLYMARKET_PRIVATE_KEY;

describe('V2 Core: Authenticated Paths', () => {
    let authExchange: any;

    beforeAll(async () => {
        if (!privateKey) return;
        const mod = await import('../../src/exchanges/polymarket/index');
        authExchange = new mod.PolymarketExchange({
            privateKey,
            funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS,
            signatureType: process.env.POLYMARKET_SIGNATURE_TYPE,
        });
    }, LONG_TIMEOUT);

    test('fetchBalance returns USDC balance', async () => {
        if (!privateKey) return;
        const balances = await authExchange.fetchBalance();

        expect(Array.isArray(balances)).toBe(true);
        expect(balances.length).toBe(1);
        expect(balances[0].currency).toBe('USDC');
        expect(typeof balances[0].total).toBe('number');
        expect(typeof balances[0].available).toBe('number');
        expect(typeof balances[0].locked).toBe('number');
        expect(balances[0].total).toBeGreaterThanOrEqual(0);
    }, LONG_TIMEOUT);

    test('fetchPositions returns position array', async () => {
        if (!privateKey) return;
        const positions = await authExchange.fetchPositions();

        expect(Array.isArray(positions)).toBe(true);
        if (positions.length > 0) {
            const p = positions[0];
            expect(typeof p.marketId).toBe('string');
            expect(typeof p.outcomeId).toBe('string');
            expect(typeof p.size).toBe('number');
        }
    }, LONG_TIMEOUT);

    test('preWarmMarket completes without error', async () => {
        if (!privateKey) return;
        // Validates getTickSize, getFeeRateBps, getNegRisk all work on V2
        await expect(
            authExchange.preWarmMarket(sampleOutcomeId),
        ).resolves.toBeUndefined();
    }, LONG_TIMEOUT);

    test('buildOrder creates valid signed order', async () => {
        if (!privateKey) return;
        const built = await authExchange.buildOrder({
            marketId: sampleMarketId,
            outcomeId: sampleOutcomeId,
            side: 'buy',
            price: 0.01,
            amount: 5,
            type: 'limit',
        });

        expect(built.exchange).toBe('Polymarket');
        expect(built.raw).toBeDefined();

        const raw = built.raw as Record<string, any>;
        // V2 order struct: must have maker, signer, signature, salt, tokenId
        expect(typeof raw.maker).toBe('string');
        expect(typeof raw.signer).toBe('string');
        expect(typeof raw.signature).toBe('string');
        expect(typeof raw.salt).toBe('string');
        expect(typeof raw.tokenId).toBe('string');
        expect(typeof raw.makerAmount).toBe('string');
        expect(typeof raw.takerAmount).toBe('string');
    }, LONG_TIMEOUT);
});
