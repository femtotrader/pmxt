import { describe, test, expect } from '@jest/globals';
import { OpinionNormalizer } from '../../../src/exchanges/opinion/normalizer';
import {
    OpinionRawMarket,
    OpinionRawChildMarket,
    OpinionRawOrderBook,
    OpinionRawPricePoint,
    OpinionRawUserTrade,
    OpinionRawPosition,
    OpinionRawOrder,
} from '../../../src/exchanges/opinion/fetcher';
import { OHLCVParams } from '../../../src/BaseExchange';
import { validatePriceCandle, validateOrderBook } from '../../compliance/shared';

const normalizer = new OpinionNormalizer();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RAW_BINARY_MARKET: OpinionRawMarket = {
    marketId: 100,
    marketTitle: 'Will BTC hit 100k by end of 2026?',
    status: 2,
    statusEnum: 'Activated',
    marketType: 0,
    yesLabel: 'Yes',
    noLabel: 'No',
    rules: 'Resolves Yes if BTC spot price exceeds 100000 USD.',
    yesTokenId: 'yes-token-abc',
    noTokenId: 'no-token-def',
    conditionId: 'cond-1',
    volume: '500000',
    volume24h: '12000',
    quoteToken: 'USDT',
    chainId: '56',
    questionId: 'q-1',
    createdAt: 1700000000,
    cutoffAt: 1798761600,
};

const CHILD_MARKET_A: OpinionRawChildMarket = {
    marketId: 201,
    marketTitle: 'Decrease rates',
    status: 2,
    statusEnum: 'Activated',
    yesLabel: 'Yes',
    noLabel: 'No',
    rules: 'Resolves Yes if rates decrease.',
    yesTokenId: 'child-a-yes',
    noTokenId: 'child-a-no',
    conditionId: 'cond-a',
    volume: '3000',
    quoteToken: 'USDT',
    chainId: '56',
    questionId: 'q-a',
    createdAt: 1700000000,
    cutoffAt: 1798761600,
};

const CHILD_MARKET_B: OpinionRawChildMarket = {
    marketId: 202,
    marketTitle: 'No change',
    status: 2,
    statusEnum: 'Activated',
    yesLabel: 'Yes',
    noLabel: 'No',
    rules: 'Resolves Yes if no change.',
    yesTokenId: 'child-b-yes',
    noTokenId: 'child-b-no',
    conditionId: 'cond-b',
    volume: '7000',
    quoteToken: 'USDT',
    chainId: '56',
    questionId: 'q-b',
    createdAt: 1700000000,
    cutoffAt: 1798761600,
};

const RAW_CATEGORICAL_MARKET: OpinionRawMarket = {
    marketId: 200,
    marketTitle: 'ECB Rates Decision June 2026',
    status: 2,
    statusEnum: 'Activated',
    marketType: 1,
    childMarkets: [CHILD_MARKET_A, CHILD_MARKET_B],
    yesLabel: '',
    noLabel: '',
    rules: 'Multi-outcome market for ECB decision.',
    yesTokenId: '',
    noTokenId: '',
    conditionId: 'cond-cat',
    volume: '10000',
    volume24h: '2500',
    quoteToken: 'USDT',
    chainId: '56',
    questionId: 'q-cat',
    createdAt: 1700000000,
    cutoffAt: 1798761600,
};

const RAW_ORDERBOOK: OpinionRawOrderBook = {
    market: '100',
    tokenId: 'yes-token-abc',
    timestamp: 1700000000000,
    bids: [
        { price: '0.65', size: '1000' },
        { price: '0.60', size: '2000' },
        { price: '0.55', size: '500' },
    ],
    asks: [
        { price: '0.70', size: '800' },
        { price: '0.75', size: '1500' },
    ],
};

const RAW_PRICE_POINTS: OpinionRawPricePoint[] = [
    { t: 1700000000, p: '0.50' },
    { t: 1700000060, p: '0.52' },
    { t: 1700000120, p: '0.48' },
    { t: 1700000180, p: '0.55' },
    { t: 1700003600, p: '0.60' },
];

const RAW_USER_TRADE: OpinionRawUserTrade = {
    txHash: '0xabc123',
    marketId: 100,
    marketTitle: 'Will BTC hit 100k?',
    side: 'BUY',
    outcome: 'Yes',
    outcomeSide: 1,
    outcomeSideEnum: 'Yes',
    price: '0.65',
    shares: '100',
    amount: '65',
    fee: '0.50',
    profit: '0',
    quoteToken: 'USDT',
    quoteTokenUsdPrice: '1.0',
    usdAmount: '65',
    status: 2,
    statusEnum: 'Filled',
    chainId: '56',
    createdAt: 1700000000,
};

const RAW_POSITION: OpinionRawPosition = {
    marketId: 100,
    marketTitle: 'Will BTC hit 100k?',
    marketStatus: 2,
    marketStatusEnum: 'Activated',
    marketCutoffAt: 1798761600,
    outcome: 'Yes',
    outcomeSide: 1,
    outcomeSideEnum: 'Yes',
    sharesOwned: '200',
    sharesFrozen: '0',
    unrealizedPnl: '20',
    unrealizedPnlPercent: '10',
    dailyPnlChange: '5',
    dailyPnlChangePercent: '2.5',
    conditionId: 'cond-1',
    tokenId: 'yes-token-abc',
    currentValueInQuoteToken: '140',
    avgEntryPrice: '0.60',
    claimStatus: 0,
    claimStatusEnum: 'None',
    quoteToken: 'USDT',
};

const RAW_ORDER: OpinionRawOrder = {
    orderId: 'order-001',
    status: 1,
    statusEnum: 'Pending',
    marketId: 100,
    marketTitle: 'Will BTC hit 100k?',
    side: 1,
    sideEnum: 'Buy',
    tradingMethod: 2,
    tradingMethodEnum: 'Limit',
    outcome: 'Yes',
    outcomeSide: 1,
    outcomeSideEnum: 'Yes',
    price: '0.65',
    orderShares: '100',
    orderAmount: '65',
    filledShares: '30',
    filledAmount: '19.5',
    profit: '0',
    quoteToken: 'USDT',
    createdAt: 1700000000,
};

// ---------------------------------------------------------------------------
// normalizeMarket (binary)
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeMarket', () => {
    test('should produce a valid UnifiedMarket for a binary market', () => {
        const market = normalizer.normalizeMarket(RAW_BINARY_MARKET);
        expect(market).not.toBeNull();
        expect(market!.marketId).toBe('100');
        expect(market!.title).toBe('Will BTC hit 100k by end of 2026?');
        expect(market!.description).toBe('Resolves Yes if BTC spot price exceeds 100000 USD.');
        expect(market!.outcomes).toHaveLength(2);
    });

    test('should set binary outcomes with correct token IDs', () => {
        const market = normalizer.normalizeMarket(RAW_BINARY_MARKET);
        const yes = market!.outcomes[0];
        const no = market!.outcomes[1];

        expect(yes.outcomeId).toBe('yes-token-abc');
        expect(yes.label).toBe('Yes');
        expect(yes.price).toBeGreaterThanOrEqual(0);
        expect(yes.price).toBeLessThanOrEqual(1);

        expect(no.outcomeId).toBe('no-token-def');
        expect(no.label).toBe('No');
    });

    test('should set yes/no convenience properties via addBinaryOutcomes', () => {
        const market = normalizer.normalizeMarket(RAW_BINARY_MARKET);
        expect(market!.yes).toBeDefined();
        expect(market!.no).toBeDefined();
        expect(market!.yes!.outcomeId).toBe('yes-token-abc');
        expect(market!.no!.outcomeId).toBe('no-token-def');
    });

    test('should parse volume fields from strings', () => {
        const market = normalizer.normalizeMarket(RAW_BINARY_MARKET);
        expect(market!.volume24h).toBe(12000);
        expect(market!.volume).toBe(500000);
    });

    test('should set resolution date from cutoffAt', () => {
        const market = normalizer.normalizeMarket(RAW_BINARY_MARKET);
        expect(market!.resolutionDate).toBeInstanceOf(Date);
        expect(market!.resolutionDate.getTime()).toBe(1798761600 * 1000);
    });

    test('should set url', () => {
        const market = normalizer.normalizeMarket(RAW_BINARY_MARKET);
        expect(market!.url).toBe('https://opinion.trade/market/100');
    });

    test('should return null for null input', () => {
        expect(normalizer.normalizeMarket(null as any)).toBeNull();
    });

    test('should return null for undefined input', () => {
        expect(normalizer.normalizeMarket(undefined as any)).toBeNull();
    });

    test('should handle missing optional string fields', () => {
        const minimal: OpinionRawMarket = {
            marketId: 999,
            marketTitle: '',
            status: 2,
            statusEnum: 'Activated',
            marketType: 0,
            yesLabel: '',
            noLabel: '',
            rules: '',
            yesTokenId: '',
            noTokenId: '',
            conditionId: '',
            volume: '',
            volume24h: '',
            quoteToken: '',
            chainId: '56',
            questionId: '',
            createdAt: 0,
            cutoffAt: 0,
        };
        const market = normalizer.normalizeMarket(minimal);
        expect(market).not.toBeNull();
        expect(market!.marketId).toBe('999');
        expect(market!.volume24h).toBe(0);
        expect(market!.volume).toBe(0);
    });

    test('should delegate categorical markets to normalizeMarketsFromEvent', () => {
        const market = normalizer.normalizeMarket(RAW_CATEGORICAL_MARKET);
        // For categorical, normalizeMarket returns the first child
        expect(market).not.toBeNull();
        expect(market!.marketId).toBe('201');
    });
});

// ---------------------------------------------------------------------------
// normalizeMarketsFromEvent
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeMarketsFromEvent', () => {
    test('should wrap binary market in single-element array', () => {
        const markets = normalizer.normalizeMarketsFromEvent(RAW_BINARY_MARKET);
        expect(markets).toHaveLength(1);
        expect(markets[0].marketId).toBe('100');
    });

    test('should produce one market per child for categorical', () => {
        const markets = normalizer.normalizeMarketsFromEvent(RAW_CATEGORICAL_MARKET);
        expect(markets).toHaveLength(2);
        expect(markets[0].marketId).toBe('201');
        expect(markets[0].title).toBe('Decrease rates');
        expect(markets[1].marketId).toBe('202');
        expect(markets[1].title).toBe('No change');
    });

    test('should set eventId on child markets', () => {
        const markets = normalizer.normalizeMarketsFromEvent(RAW_CATEGORICAL_MARKET);
        expect(markets[0].eventId).toBe('200');
        expect(markets[1].eventId).toBe('200');
    });

    test('should set volume from child market volume', () => {
        const markets = normalizer.normalizeMarketsFromEvent(RAW_CATEGORICAL_MARKET);
        expect(markets[0].volume).toBe(3000);
        expect(markets[1].volume).toBe(7000);
    });

    test('should return empty array for null input', () => {
        expect(normalizer.normalizeMarketsFromEvent(null as any)).toEqual([]);
    });

    test('should handle categorical market with no children', () => {
        const noChildren: OpinionRawMarket = {
            ...RAW_CATEGORICAL_MARKET,
            childMarkets: [],
        };
        expect(normalizer.normalizeMarketsFromEvent(noChildren)).toEqual([]);
    });

    test('should handle categorical market with missing childMarkets field', () => {
        const noField: OpinionRawMarket = {
            ...RAW_CATEGORICAL_MARKET,
            childMarkets: undefined,
        };
        expect(normalizer.normalizeMarketsFromEvent(noField)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// normalizeEvent
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeEvent', () => {
    test('should normalize binary market into event', () => {
        const event = normalizer.normalizeEvent(RAW_BINARY_MARKET);
        expect(event).not.toBeNull();
        expect(event!.id).toBe('100');
        expect(event!.title).toBe('Will BTC hit 100k by end of 2026?');
        expect(event!.markets).toHaveLength(1);
        expect(event!.url).toBe('https://opinion.trade/market/100');
    });

    test('should normalize categorical market into event with child markets', () => {
        const event = normalizer.normalizeEvent(RAW_CATEGORICAL_MARKET);
        expect(event).not.toBeNull();
        expect(event!.id).toBe('200');
        expect(event!.markets).toHaveLength(2);
    });

    test('should use volume24h from raw when available', () => {
        const event = normalizer.normalizeEvent(RAW_CATEGORICAL_MARKET);
        expect(event!.volume24h).toBe(2500);
    });

    test('should sum child volumes when volume24h missing', () => {
        const noVolume24h: OpinionRawMarket = {
            ...RAW_BINARY_MARKET,
            volume24h: '',
        };
        const event = normalizer.normalizeEvent(noVolume24h);
        // Falls back to summing market volume24h values
        expect(typeof event!.volume24h).toBe('number');
    });

    test('should set slug as string marketId', () => {
        const event = normalizer.normalizeEvent(RAW_BINARY_MARKET);
        expect(event!.slug).toBe('100');
    });

    test('should return null for null input', () => {
        expect(normalizer.normalizeEvent(null as any)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// normalizeOHLCV
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeOHLCV', () => {
    test('should convert price points to candles (1m buckets)', () => {
        const params: OHLCVParams = { resolution: '1m' };
        const candles = normalizer.normalizeOHLCV({ history: RAW_PRICE_POINTS }, params);

        // 5 points: 4 in the first hour (0, 60, 120, 180 sec) and 1 at 3600 sec
        // With 1m buckets, each point gets its own bucket
        expect(candles.length).toBe(5);
        expect(candles[0].open).toBeCloseTo(0.50);
        expect(candles[0].close).toBeCloseTo(0.50);
    });

    test('should aggregate into 1h buckets', () => {
        const params: OHLCVParams = { resolution: '1h' };
        const candles = normalizer.normalizeOHLCV({ history: RAW_PRICE_POINTS }, params);

        // First 4 points fall in same hour bucket, last one in next
        expect(candles.length).toBe(2);

        // First bucket: open=0.50, high=0.55, low=0.48, close=0.55
        expect(candles[0].open).toBeCloseTo(0.50);
        expect(candles[0].high).toBeCloseTo(0.55);
        expect(candles[0].low).toBeCloseTo(0.48);
        expect(candles[0].close).toBeCloseTo(0.55);

        // Second bucket: single point at 0.60
        expect(candles[1].open).toBeCloseTo(0.60);
        expect(candles[1].close).toBeCloseTo(0.60);
    });

    test('should convert timestamps from seconds to milliseconds', () => {
        const params: OHLCVParams = { resolution: '1m' };
        const candles = normalizer.normalizeOHLCV({ history: RAW_PRICE_POINTS }, params);
        // Timestamps should be in ms range
        expect(candles[0].timestamp).toBeGreaterThan(1_000_000_000_000);
    });

    test('should respect limit parameter (takes last N)', () => {
        const params: OHLCVParams = { resolution: '1m', limit: 2 };
        const candles = normalizer.normalizeOHLCV({ history: RAW_PRICE_POINTS }, params);
        expect(candles).toHaveLength(2);
        // Should return last 2 candles
        expect(candles[1].close).toBeCloseTo(0.60);
    });

    test('should return empty for empty history', () => {
        const params: OHLCVParams = { resolution: '1h' };
        expect(normalizer.normalizeOHLCV({ history: [] }, params)).toEqual([]);
    });

    test('should return empty for null history', () => {
        const params: OHLCVParams = { resolution: '1h' };
        expect(normalizer.normalizeOHLCV({ history: null as any }, params)).toEqual([]);
    });

    test('candles should pass OHLCV mathematical consistency', () => {
        const params: OHLCVParams = { resolution: '1h' };
        const candles = normalizer.normalizeOHLCV({ history: RAW_PRICE_POINTS }, params);
        for (const c of candles) {
            validatePriceCandle(c, 'Opinion', 'test');
        }
    });
});

// ---------------------------------------------------------------------------
// normalizeOrderBook
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeOrderBook', () => {
    test('should parse bid/ask price and size from strings', () => {
        const book = normalizer.normalizeOrderBook(RAW_ORDERBOOK, 'yes-token-abc');

        expect(book.bids).toHaveLength(3);
        expect(book.asks).toHaveLength(2);

        expect(book.bids[0].price).toBe(0.65);
        expect(book.bids[0].size).toBe(1000);
        expect(book.asks[0].price).toBe(0.70);
        expect(book.asks[0].size).toBe(800);
    });

    test('should sort bids descending and asks ascending', () => {
        const shuffled: OpinionRawOrderBook = {
            ...RAW_ORDERBOOK,
            bids: [
                { price: '0.55', size: '500' },
                { price: '0.65', size: '1000' },
                { price: '0.60', size: '2000' },
            ],
            asks: [
                { price: '0.75', size: '1500' },
                { price: '0.70', size: '800' },
            ],
        };

        const book = normalizer.normalizeOrderBook(shuffled, 'test');
        expect(book.bids[0].price).toBe(0.65);
        expect(book.bids[1].price).toBe(0.60);
        expect(book.bids[2].price).toBe(0.55);
        expect(book.asks[0].price).toBe(0.70);
        expect(book.asks[1].price).toBe(0.75);
    });

    test('should preserve timestamp', () => {
        const book = normalizer.normalizeOrderBook(RAW_ORDERBOOK, 'test');
        expect(book.timestamp).toBe(1700000000000);
    });

    test('should handle empty bids and asks', () => {
        const empty: OpinionRawOrderBook = {
            market: '100',
            tokenId: 'test',
            timestamp: 1700000000000,
            bids: [],
            asks: [],
        };
        const book = normalizer.normalizeOrderBook(empty, 'test');
        expect(book.bids).toEqual([]);
        expect(book.asks).toEqual([]);
    });

    test('should handle null/missing bid/ask arrays', () => {
        const nullArrays = {
            market: '100',
            tokenId: 'test',
            timestamp: 1700000000000,
        } as any;
        const book = normalizer.normalizeOrderBook(nullArrays, 'test');
        expect(book.bids).toEqual([]);
        expect(book.asks).toEqual([]);
    });

    test('should pass order book compliance validation', () => {
        const book = normalizer.normalizeOrderBook(RAW_ORDERBOOK, 'test');
        validateOrderBook(book, 'Opinion', 'test');
    });
});

// ---------------------------------------------------------------------------
// normalizeUserTrade
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeUserTrade', () => {
    test('should convert raw user trade to unified UserTrade', () => {
        const trade = normalizer.normalizeUserTrade(RAW_USER_TRADE, 0);

        expect(trade.id).toBe('0xabc123');
        expect(trade.timestamp).toBe(1700000000 * 1000);
        expect(trade.price).toBeCloseTo(0.65);
        expect(trade.amount).toBe(100);
        expect(trade.side).toBe('buy');
    });

    test('should map SELL side correctly', () => {
        const sellTrade: OpinionRawUserTrade = { ...RAW_USER_TRADE, side: 'SELL' };
        expect(normalizer.normalizeUserTrade(sellTrade, 0).side).toBe('sell');
    });

    test('should use index as id when txHash is missing', () => {
        const noHash: OpinionRawUserTrade = { ...RAW_USER_TRADE, txHash: '' };
        expect(normalizer.normalizeUserTrade(noHash, 5).id).toBe('5');
    });

    test('should map unknown side to unknown', () => {
        const unknownSide: OpinionRawUserTrade = { ...RAW_USER_TRADE, side: 'OTHER' };
        expect(normalizer.normalizeUserTrade(unknownSide, 0).side).toBe('unknown');
    });
});

// ---------------------------------------------------------------------------
// normalizeTrade
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeTrade', () => {
    test('should convert raw trade to unified Trade', () => {
        const trade = normalizer.normalizeTrade(RAW_USER_TRADE, 0);

        expect(trade.id).toBe('0xabc123');
        expect(trade.price).toBeCloseTo(0.65);
        expect(trade.amount).toBe(100);
        expect(trade.side).toBe('buy');
    });
});

// ---------------------------------------------------------------------------
// normalizePosition
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizePosition', () => {
    test('should produce a valid Position', () => {
        const pos = normalizer.normalizePosition(RAW_POSITION);

        expect(pos.marketId).toBe('100');
        expect(pos.outcomeId).toBe('yes-token-abc');
        expect(pos.outcomeLabel).toBe('Yes');
        expect(pos.size).toBe(200);
        expect(pos.entryPrice).toBeCloseTo(0.60);
        expect(pos.unrealizedPnL).toBe(20);
    });

    test('should calculate currentPrice from value / shares', () => {
        const pos = normalizer.normalizePosition(RAW_POSITION);
        // currentValueInQuoteToken=140, sharesOwned=200 -> 0.70
        expect(pos.currentPrice).toBeCloseTo(0.70);
    });

    test('should return 0 currentPrice when shares is 0', () => {
        const zeroShares: OpinionRawPosition = {
            ...RAW_POSITION,
            sharesOwned: '0',
        };
        expect(normalizer.normalizePosition(zeroShares).currentPrice).toBe(0);
    });

    test('should fall back outcome label to side name', () => {
        const noOutcome: OpinionRawPosition = {
            ...RAW_POSITION,
            outcome: '',
            outcomeSide: 2,
        };
        expect(normalizer.normalizePosition(noOutcome).outcomeLabel).toBe('No');
    });

    test('should default to Yes when outcomeSide is 1 and outcome is empty', () => {
        const noOutcome: OpinionRawPosition = {
            ...RAW_POSITION,
            outcome: '',
            outcomeSide: 1,
        };
        expect(normalizer.normalizePosition(noOutcome).outcomeLabel).toBe('Yes');
    });
});

// ---------------------------------------------------------------------------
// normalizeOrder
// ---------------------------------------------------------------------------

describe('OpinionNormalizer.normalizeOrder', () => {
    test('should produce a valid Order', () => {
        const order = normalizer.normalizeOrder(RAW_ORDER);

        expect(order.id).toBe('order-001');
        expect(order.marketId).toBe('100');
        expect(order.side).toBe('buy');
        expect(order.type).toBe('limit');
        expect(order.price).toBeCloseTo(0.65);
        expect(order.amount).toBe(100);
        expect(order.filled).toBe(30);
        expect(order.remaining).toBe(70);
        expect(order.status).toBe('pending');
    });

    test('should map sell side (side=2)', () => {
        const sellOrder: OpinionRawOrder = { ...RAW_ORDER, side: 2, sideEnum: 'Sell' };
        expect(normalizer.normalizeOrder(sellOrder).side).toBe('sell');
    });

    test('should map market trading method (tradingMethod=1)', () => {
        const marketOrder: OpinionRawOrder = {
            ...RAW_ORDER,
            tradingMethod: 1,
            tradingMethodEnum: 'Market',
        };
        expect(normalizer.normalizeOrder(marketOrder).type).toBe('market');
    });

    test('should map filled status (status=2)', () => {
        const filled: OpinionRawOrder = { ...RAW_ORDER, status: 2, statusEnum: 'Filled' };
        expect(normalizer.normalizeOrder(filled).status).toBe('filled');
    });

    test('should map canceled status (status=3)', () => {
        const canceled: OpinionRawOrder = { ...RAW_ORDER, status: 3, statusEnum: 'Canceled' };
        expect(normalizer.normalizeOrder(canceled).status).toBe('cancelled');
    });

    test('should map expired status to cancelled (status=4)', () => {
        const expired: OpinionRawOrder = { ...RAW_ORDER, status: 4, statusEnum: 'Expired' };
        expect(normalizer.normalizeOrder(expired).status).toBe('cancelled');
    });

    test('should map failed status to rejected (status=5)', () => {
        const failed: OpinionRawOrder = { ...RAW_ORDER, status: 5, statusEnum: 'Failed' };
        expect(normalizer.normalizeOrder(failed).status).toBe('rejected');
    });

    test('should convert timestamp from seconds to millis', () => {
        const order = normalizer.normalizeOrder(RAW_ORDER);
        expect(order.timestamp).toBe(1700000000 * 1000);
    });

    test('should handle fully filled order (remaining=0)', () => {
        const fullyFilled: OpinionRawOrder = {
            ...RAW_ORDER,
            filledShares: '100',
            filledAmount: '65',
            status: 2,
        };
        const order = normalizer.normalizeOrder(fullyFilled);
        expect(order.filled).toBe(100);
        expect(order.remaining).toBe(0);
    });
});
