import { describe, test, expect } from '@jest/globals';
import { ProbableNormalizer } from '../../../src/exchanges/probable/normalizer';
import {
    ProbableRawTrade,
    ProbableRawPosition,
    ProbableRawPricePoint,
} from '../../../src/exchanges/probable/fetcher';
import { OHLCVParams } from '../../../src/BaseExchange';

const normalizer = new ProbableNormalizer();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_RAW_TRADE: ProbableRawTrade = {
    id: 'trade-1',
    time: 1700000000,
    price: '0.65',
    size: '10',
    side: 'BUY',
};

const VALID_RAW_POSITION: ProbableRawPosition = {
    condition_id: 'cond-abc',
    token_id: 'tok-123',
    outcome: 'Yes',
    size: '5',
    avg_price: '0.4',
    cur_price: '0.6',
    cash_pnl: '1.0',
    realized_pnl: '0.5',
};

// ---------------------------------------------------------------------------
// normalizeTrade -- valid data
// ---------------------------------------------------------------------------

describe('ProbableNormalizer.normalizeTrade', () => {
    test('normalizes a valid trade', () => {
        const result = normalizer.normalizeTrade(VALID_RAW_TRADE, 0);
        expect(result.id).toBe('trade-1');
        expect(result.timestamp).toBe(1700000000000);
        expect(result.price).toBe(0.65);
        expect(result.amount).toBe(10);
        expect(result.side).toBe('buy');
    });

    test('throws when id and tradeId are both missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, id: undefined, tradeId: undefined };
        expect(() => normalizer.normalizeTrade(raw, 0)).toThrow(/missing required field "id" or "tradeId"/);
    });

    test('throws when price is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, price: undefined };
        expect(() => normalizer.normalizeTrade(raw, 1)).toThrow(/missing required field "price"/);
    });

    test('throws when size is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, size: undefined };
        expect(() => normalizer.normalizeTrade(raw, 2)).toThrow(/missing required field "size"/);
    });

    test('throws when time is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, time: undefined };
        expect(() => normalizer.normalizeTrade(raw, 3)).toThrow(/missing required field "time"/);
    });
});

// ---------------------------------------------------------------------------
// normalizeUserTrade -- valid data
// ---------------------------------------------------------------------------

describe('ProbableNormalizer.normalizeUserTrade', () => {
    test('normalizes a valid user trade', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, tradeId: 'ut-1', orderId: 'order-5' };
        const result = normalizer.normalizeUserTrade(raw, 0);
        expect(result.id).toBe('ut-1');
        expect(result.price).toBe(0.65);
        expect(result.amount).toBe(10);
        expect(result.side).toBe('buy');
        expect(result.orderId).toBe('order-5');
    });

    test('throws when tradeId and id are both missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, id: undefined, tradeId: undefined };
        expect(() => normalizer.normalizeUserTrade(raw, 0)).toThrow(/missing required field "tradeId" or "id"/);
    });

    test('throws when price is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, price: undefined };
        expect(() => normalizer.normalizeUserTrade(raw, 0)).toThrow(/missing required field "price"/);
    });

    test('throws when size is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, size: undefined };
        expect(() => normalizer.normalizeUserTrade(raw, 0)).toThrow(/missing required field "size"/);
    });

    test('throws when time is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, time: undefined };
        expect(() => normalizer.normalizeUserTrade(raw, 0)).toThrow(/missing required field "time"/);
    });

    test('throws when side is missing', () => {
        const raw: ProbableRawTrade = { ...VALID_RAW_TRADE, side: undefined };
        expect(() => normalizer.normalizeUserTrade(raw, 0)).toThrow(/missing required field "side"/);
    });
});

// ---------------------------------------------------------------------------
// normalizePosition -- valid data and validation
// ---------------------------------------------------------------------------

describe('ProbableNormalizer.normalizePosition', () => {
    test('normalizes a valid position', () => {
        const result = normalizer.normalizePosition(VALID_RAW_POSITION);
        expect(result.marketId).toBe('cond-abc');
        expect(result.outcomeId).toBe('tok-123');
        expect(result.outcomeLabel).toBe('Yes');
        expect(result.size).toBe(5);
        expect(result.entryPrice).toBe(0.4);
        expect(result.currentPrice).toBe(0.6);
        expect(result.unrealizedPnL).toBe(1.0);
        expect(result.realizedPnL).toBe(0.5);
    });

    test('throws when condition_id is missing', () => {
        const raw: ProbableRawPosition = { ...VALID_RAW_POSITION, condition_id: undefined };
        expect(() => normalizer.normalizePosition(raw)).toThrow(/missing required field "condition_id"/);
    });

    test('throws when token_id is missing', () => {
        const raw: ProbableRawPosition = { ...VALID_RAW_POSITION, token_id: undefined };
        expect(() => normalizer.normalizePosition(raw)).toThrow(/missing required field "token_id"/);
    });

    test('throws when size is missing', () => {
        const raw: ProbableRawPosition = { ...VALID_RAW_POSITION, size: undefined };
        expect(() => normalizer.normalizePosition(raw)).toThrow(/missing required field "size"/);
    });
});
