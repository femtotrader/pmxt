import { describe, test, expect } from '@jest/globals';
import { PolymarketNormalizer } from '../../../src/exchanges/polymarket/normalizer';
import {
    PolymarketRawEvent,
    PolymarketRawMarket,
    PolymarketRawOHLCVPoint,
    PolymarketRawOrderBook,
    PolymarketRawTrade,
    PolymarketRawPosition,
} from '../../../src/exchanges/polymarket/fetcher';
import { OHLCVParams } from '../../../src/BaseExchange';
import { validatePriceCandle, validateOrderBook } from '../../compliance/shared';

const normalizer = new PolymarketNormalizer();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RAW_MARKET: PolymarketRawMarket = {
    id: 'mkt-abc-123',
    question: 'Will it rain tomorrow?',
    description: 'Resolves Yes if it rains.',
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.65","0.35"]',
    clobTokenIds: '["tok-yes","tok-no"]',
    endDate: '2025-12-31T00:00:00Z',
    volume24hr: 50000,
    volume: 1000000,
    liquidity: 25000,
    openInterest: 15000,
};

const RAW_EVENT: PolymarketRawEvent = {
    id: 'event-1',
    slug: 'rain-tomorrow',
    title: 'Weather',
    description: 'Weather prediction market',
    image: 'https://example.com/img.png',
    category: 'science',
    tags: [{ label: 'weather' }, { label: 'forecast' }],
    markets: [RAW_MARKET],
};

// ---------------------------------------------------------------------------
// normalizeMarket
// ---------------------------------------------------------------------------

describe('PolymarketNormalizer.normalizeMarket', () => {
    test('should produce a valid UnifiedMarket from a realistic event', () => {
        const market = normalizer.normalizeMarket(RAW_EVENT);
        expect(market).not.toBeNull();

        expect(typeof market!.marketId).toBe('string');
        expect(market!.marketId.length).toBeGreaterThan(0);
        expect(market!.title).toBeDefined();
        expect(market!.outcomes).toHaveLength(2);

        for (const o of market!.outcomes) {
            expect(typeof o.outcomeId).toBe('string');
            expect(o.outcomeId.length).toBeGreaterThan(0);
            expect(typeof o.label).toBe('string');
            expect(typeof o.price).toBe('number');
            expect(o.price).toBeGreaterThanOrEqual(0);
            expect(o.price).toBeLessThanOrEqual(1);
        }

        expect(market!.resolutionDate).toBeInstanceOf(Date);
        expect(isNaN(market!.resolutionDate.getTime())).toBe(false);
        expect(market!.volume24h).toBe(50000);
        expect(market!.liquidity).toBe(25000);
        expect(market!.url).toMatch(/^https:\/\//);
    });

    test('should parse stringified JSON outcomes', () => {
        const market = normalizer.normalizeMarket(RAW_EVENT);
        expect(market!.outcomes[0].label).toBe('Yes');
        expect(market!.outcomes[1].label).toBe('No');
    });

    test('should parse stringified JSON outcomePrices', () => {
        const market = normalizer.normalizeMarket(RAW_EVENT);
        expect(market!.outcomes[0].price).toBeCloseTo(0.65);
        expect(market!.outcomes[1].price).toBeCloseTo(0.35);
    });

    test('should parse stringified clobTokenIds into outcomeIds', () => {
        const market = normalizer.normalizeMarket(RAW_EVENT);
        expect(market!.outcomes[0].outcomeId).toBe('tok-yes');
        expect(market!.outcomes[1].outcomeId).toBe('tok-no');
    });

    test('should enrich Yes label with groupItemTitle', () => {
        const marketWithCandidate: PolymarketRawMarket = {
            ...RAW_MARKET,
            groupItemTitle: 'Trump',
        };
        const event: PolymarketRawEvent = { ...RAW_EVENT, markets: [marketWithCandidate] };
        const market = normalizer.normalizeMarket(event);

        expect(market!.outcomes[0].label).toBe('Trump');
        expect(market!.outcomes[1].label).toBe('Not Trump');
    });

    test('should handle volume24hr vs volume_24h field names', () => {
        const altMarket: PolymarketRawMarket = {
            ...RAW_MARKET,
            volume24hr: undefined,
            volume_24h: 77000,
        };
        const event: PolymarketRawEvent = { ...RAW_EVENT, markets: [altMarket] };
        const market = normalizer.normalizeMarket(event);
        expect(market!.volume24h).toBe(77000);
    });

    test('should prefer market image over event image when both are present', () => {
        const altMarket: PolymarketRawMarket = {
            ...RAW_MARKET,
            image: 'https://example.com/market-image.png',
        };
        const event: PolymarketRawEvent = {
            ...RAW_EVENT,
            image: 'https://example.com/event-image.png',
            markets: [altMarket],
        };

        const market = normalizer.normalizeMarket(event);

        expect(market!.image).toBe('https://example.com/market-image.png');
    });

    test('should handle end_date_iso fallback', () => {
        const altMarket: PolymarketRawMarket = {
            ...RAW_MARKET,
            endDate: undefined,
            end_date_iso: '2026-06-15T12:00:00Z',
        };
        const event: PolymarketRawEvent = { ...RAW_EVENT, markets: [altMarket] };
        const market = normalizer.normalizeMarket(event);
        expect(market!.resolutionDate.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });

    test('should return null for null input', () => {
        expect(normalizer.normalizeMarket(null as any)).toBeNull();
    });

    test('should return null for undefined input', () => {
        expect(normalizer.normalizeMarket(undefined as any)).toBeNull();
    });

    test('should return null for event with no markets', () => {
        const empty: PolymarketRawEvent = { ...RAW_EVENT, markets: undefined };
        expect(normalizer.normalizeMarket(empty)).toBeNull();
    });

    test('should handle missing optional fields without crashing', () => {
        const minimal: PolymarketRawMarket = {
            id: 'min-1',
            outcomes: '["Yes","No"]',
            outcomePrices: '["0.50","0.50"]',
        };
        const event: PolymarketRawEvent = { slug: 'min', title: 'Min', markets: [minimal] };
        const market = normalizer.normalizeMarket(event);
        expect(market).not.toBeNull();
        expect(market!.outcomes).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// normalizeOrderBook
// ---------------------------------------------------------------------------

describe('PolymarketNormalizer.normalizeOrderBook', () => {
    test('should convert string prices/sizes to numbers and sort correctly', () => {
        const raw: PolymarketRawOrderBook = {
            bids: [
                { price: '0.40', size: '100' },
                { price: '0.60', size: '200' },
                { price: '0.50', size: '150' },
            ],
            asks: [
                { price: '0.80', size: '50' },
                { price: '0.65', size: '300' },
                { price: '0.70', size: '75' },
            ],
            timestamp: '2025-06-01T00:00:00Z',
        };

        const ob = normalizer.normalizeOrderBook(raw, 'tok-yes');

        // Bids descending
        expect(ob.bids[0].price).toBe(0.6);
        expect(ob.bids[1].price).toBe(0.5);
        expect(ob.bids[2].price).toBe(0.4);

        // Asks ascending
        expect(ob.asks[0].price).toBe(0.65);
        expect(ob.asks[1].price).toBe(0.7);
        expect(ob.asks[2].price).toBe(0.8);

        // All values are numbers
        for (const level of [...ob.bids, ...ob.asks]) {
            expect(typeof level.price).toBe('number');
            expect(typeof level.size).toBe('number');
        }

        validateOrderBook(ob, 'Polymarket', 'tok-yes');
    });

    test('should handle empty bids/asks', () => {
        const raw: PolymarketRawOrderBook = { bids: [], asks: [] };
        const ob = normalizer.normalizeOrderBook(raw, 'tok-yes');
        expect(ob.bids).toHaveLength(0);
        expect(ob.asks).toHaveLength(0);
    });

    test('should handle missing bids/asks', () => {
        const raw: PolymarketRawOrderBook = {};
        const ob = normalizer.normalizeOrderBook(raw, 'tok-yes');
        expect(ob.bids).toHaveLength(0);
        expect(ob.asks).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// normalizeTrade
// ---------------------------------------------------------------------------

describe('PolymarketNormalizer.normalizeTrade', () => {
    test('should convert raw trade to unified Trade', () => {
        const raw: PolymarketRawTrade = {
            id: 'trade-1',
            timestamp: 1700000000,
            price: '0.72',
            size: '50',
            side: 'BUY',
        };

        const trade = normalizer.normalizeTrade(raw, 0);

        expect(trade.id).toBe('trade-1');
        expect(trade.timestamp).toBe(1700000000000); // seconds → ms
        expect(trade.price).toBeCloseTo(0.72);
        expect(trade.amount).toBe(50);
        expect(trade.side).toBe('buy');
    });

    test('should map SELL side correctly', () => {
        const raw: PolymarketRawTrade = {
            timestamp: 1700000000,
            price: '0.30',
            size: '10',
            side: 'SELL',
        };
        expect(normalizer.normalizeTrade(raw, 0).side).toBe('sell');
    });

    test('should map unknown side', () => {
        const raw: PolymarketRawTrade = {
            timestamp: 1700000000,
            price: '0.50',
            size: '5',
            side: 'OTHER',
        };
        expect(normalizer.normalizeTrade(raw, 0).side).toBe('unknown');
    });

    test('should use amount field when size is missing', () => {
        const raw: PolymarketRawTrade = {
            timestamp: 1700000000,
            price: '0.50',
            amount: '25',
        };
        expect(normalizer.normalizeTrade(raw, 0).amount).toBe(25);
    });
});

// ---------------------------------------------------------------------------
// normalizeOHLCV
// ---------------------------------------------------------------------------

describe('PolymarketNormalizer.normalizeOHLCV', () => {
    const points: PolymarketRawOHLCVPoint[] = [
        { t: 1700000000, p: 0.5, s: 10 },
        { t: 1700000060, p: 0.55, s: 20 },
        { t: 1700000120, p: 0.45, s: 15 },
        { t: 1700000030, p: 0.52, s: 5 },  // same 1m bucket as first
    ];

    const params: OHLCVParams = { resolution: '1m' };

    test('should produce candles sorted by timestamp ascending', () => {
        const candles = normalizer.normalizeOHLCV({ history: points }, params);
        for (let i = 1; i < candles.length; i++) {
            expect(candles[i].timestamp).toBeGreaterThanOrEqual(candles[i - 1].timestamp);
        }
    });

    test('should bucket multiple ticks in the same interval', () => {
        const candles = normalizer.normalizeOHLCV({ history: points }, params);
        // First bucket should have merged t=1700000000 and t=1700000030
        const firstCandle = candles[0];
        expect(firstCandle.open).toBe(0.5);
        expect(firstCandle.close).toBe(0.52);
        expect(firstCandle.high).toBe(0.52);
        expect(firstCandle.low).toBe(0.5);
        expect(firstCandle.volume).toBe(15); // 10 + 5
    });

    test('should respect limit parameter', () => {
        const manyPoints = Array.from({ length: 200 }, (_, i) => ({
            t: 1700000000 + i * 60,
            p: 0.5,
            s: 1,
        }));
        const candles = normalizer.normalizeOHLCV({ history: manyPoints }, { resolution: '1m', limit: 50 });
        expect(candles).toHaveLength(50);
    });

    test('should validate OHLCV mathematical consistency', () => {
        const candles = normalizer.normalizeOHLCV({ history: points }, params);
        for (const c of candles) {
            validatePriceCandle(c, 'Polymarket', 'test');
        }
    });

    test('should handle empty history', () => {
        const candles = normalizer.normalizeOHLCV({ history: [] }, params);
        expect(candles).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// normalizePosition
// ---------------------------------------------------------------------------

describe('PolymarketNormalizer.normalizePosition', () => {
    test('should prefer resolvedMarketId over conditionId', () => {
        const raw: PolymarketRawPosition = {
            conditionId: 'cond-1',
            resolvedMarketId: 'gamma-market-123',
            asset: 'tok-yes',
            outcome: 'Yes',
            size: '100.5',
            avgPrice: '0.60',
            curPrice: '0.75',
            cashPnl: '15.0',
            realizedPnl: '5.0',
        };

        const pos = normalizer.normalizePosition(raw);
        expect(pos.marketId).toBe('gamma-market-123');
        expect(pos.outcomeId).toBe('tok-yes');
        expect(pos.outcomeLabel).toBe('Yes');
        expect(pos.size).toBeCloseTo(100.5);
        expect(pos.entryPrice).toBeCloseTo(0.6);
        expect(pos.currentPrice).toBeCloseTo(0.75);
        expect(pos.unrealizedPnL).toBeCloseTo(15.0);
        expect(pos.realizedPnL).toBeCloseTo(5.0);
    });

    test('should use resolvedMarketId as marketId (conditionId is never used)', () => {
        const raw: PolymarketRawPosition = {
            conditionId: 'cond-1',
            resolvedMarketId: 'gamma-456',
            asset: 'tok-no',
            outcome: 'No',
            size: '50',
            avgPrice: '0.40',
        };

        const pos = normalizer.normalizePosition(raw);
        expect(pos.marketId).toBe('gamma-456');
    });
});
