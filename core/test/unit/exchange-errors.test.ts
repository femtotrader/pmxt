import { describe, test, expect, beforeEach } from '@jest/globals';
import axios from 'axios';
import { PolymarketExchange } from '../../src/exchanges/polymarket';
import { LimitlessExchange } from '../../src/exchanges/limitless';
import { PolymarketErrorMapper } from '../../src/exchanges/polymarket/errors';
import { LimitlessErrorMapper } from '../../src/exchanges/limitless/errors';
import {
    AuthenticationError,
    BadRequest,
    RateLimitExceeded,
    ExchangeNotAvailable,
    NetworkError,
    ValidationError,
} from '../../src/errors';

jest.mock('axios', () => {
    const mockInstance: any = {
        get: jest.fn(),
        post: jest.fn(),
        delete: jest.fn(),
        request: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
        defaults: { headers: { common: {} } },
    };
    const actualAxios = jest.requireActual('axios');
    mockInstance.create = jest.fn(() => mockInstance);
    mockInstance.isAxiosError = actualAxios.isAxiosError;
    return { __esModule: true, default: mockInstance, ...mockInstance };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;
const VALID_OUTCOME_ID = '21742633143463906290569050155826241533067272736897614950488156847949938836455';

describe('Exchange error and edge-case handling', () => {
    let poly: PolymarketExchange;

    beforeEach(() => {
        jest.clearAllMocks();
        poly = new PolymarketExchange();
    });

    describe('Malformed API responses (Polymarket)', () => {
        test('fetchMarkets handles empty array response', async () => {
            mockedAxios.get.mockResolvedValue({ data: [] });
            expect(await poly.fetchMarkets({ limit: 5 })).toEqual([]);
        });

        test('fetchMarkets handles null response body', async () => {
            mockedAxios.get.mockResolvedValue({ data: null });
            expect(Array.isArray(await poly.fetchMarkets({ limit: 5 }))).toBe(true);
        });

        test('fetchMarkets handles events with no markets array', async () => {
            mockedAxios.get.mockResolvedValue({ data: [{ id: '1' }] });
            expect(await poly.fetchMarkets({ limit: 5 })).toEqual([]);
        });

        test('fetchMarkets handles events with empty markets array', async () => {
            mockedAxios.get.mockResolvedValue({
                data: [{ id: 'event-1', title: 'Empty event', markets: [] }],
            });
            expect(await poly.fetchMarkets({ limit: 5 })).toEqual([]);
        });

        test('fetchOrderBook handles empty bids/asks', async () => {
            (mockedAxios as any).request.mockResolvedValue({ data: { bids: [], asks: [] } });
            const ob = await poly.fetchOrderBook(VALID_OUTCOME_ID);
            expect(ob.bids).toEqual([]);
            expect(ob.asks).toEqual([]);
            expect(typeof ob.timestamp).toBe('number');
        });

        test('fetchOrderBook handles response with no bids/asks keys', async () => {
            (mockedAxios as any).request.mockResolvedValue({ data: {} });
            const ob = await poly.fetchOrderBook(VALID_OUTCOME_ID);
            expect(ob.bids).toEqual([]);
            expect(ob.asks).toEqual([]);
        });
    });

    describe('Network errors (Polymarket)', () => {
        const makeNetError = (code: string, msg: string) =>
            Object.assign(new Error(msg), { code, isAxiosError: true });

        test('network timeout propagates as error', async () => {
            mockedAxios.get.mockRejectedValue(makeNetError('ECONNABORTED', 'timeout'));
            await expect(poly.fetchMarkets({ marketId: 'x' })).rejects.toThrow();
        });

        test('connection refused propagates as error', async () => {
            mockedAxios.get.mockRejectedValue(makeNetError('ECONNREFUSED', 'refused'));
            await expect(poly.fetchMarkets({ marketId: 'x' })).rejects.toThrow();
        });

        test('DNS resolution failure propagates as error', async () => {
            mockedAxios.get.mockRejectedValue(makeNetError('ENOTFOUND', 'not found'));
            await expect(poly.fetchMarkets({ marketId: 'x' })).rejects.toThrow();
        });
    });

    describe('HTTP error status codes (ErrorMapper integration)', () => {
        const polyMapper = new PolymarketErrorMapper();
        const limitlessMapper = new LimitlessErrorMapper();

        const makeAxiosErr = (status: number, data: any = {}, headers: any = {}) =>
            Object.assign(new Error(`HTTP ${status}`), {
                isAxiosError: true,
                response: { status, data, headers },
            });

        test('401 produces AuthenticationError (Polymarket)', () => {
            const mapped = polyMapper.mapError(makeAxiosErr(401, { message: 'Invalid API key' }));
            expect(mapped).toBeInstanceOf(AuthenticationError);
            expect(mapped.exchange).toBe('Polymarket');
        });

        test('429 produces RateLimitExceeded with retryAfter (Polymarket)', () => {
            const mapped = polyMapper.mapError(makeAxiosErr(429, {}, { 'retry-after': '30' }));
            expect(mapped).toBeInstanceOf(RateLimitExceeded);
            expect((mapped as RateLimitExceeded).retryAfter).toBe(30);
        });

        test('500 produces ExchangeNotAvailable (Polymarket)', () => {
            const mapped = polyMapper.mapError(makeAxiosErr(500, { error: 'Internal error' }));
            expect(mapped).toBeInstanceOf(ExchangeNotAvailable);
        });

        test('timeout code produces NetworkError (Polymarket)', () => {
            const err = Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED' });
            expect(polyMapper.mapError(err)).toBeInstanceOf(NetworkError);
        });

        test('no response produces ExchangeNotAvailable (Polymarket)', () => {
            const err = Object.assign(new Error('Network Error'), { isAxiosError: true });
            expect(polyMapper.mapError(err)).toBeInstanceOf(ExchangeNotAvailable);
        });

        test('401 produces AuthenticationError (Limitless)', () => {
            const mapped = limitlessMapper.mapError(makeAxiosErr(401, { message: 'Bad token' }));
            expect(mapped).toBeInstanceOf(AuthenticationError);
            expect(mapped.exchange).toBe('Limitless');
        });

        test('503 produces ExchangeNotAvailable (Limitless)', () => {
            expect(limitlessMapper.mapError(makeAxiosErr(503, 'Maintenance'))).toBeInstanceOf(ExchangeNotAvailable);
        });

        test('connection refused produces NetworkError', () => {
            expect(polyMapper.mapError({ code: 'ECONNREFUSED', message: 'refused' })).toBeInstanceOf(NetworkError);
        });

        test('unknown error falls back to BadRequest', () => {
            expect(polyMapper.mapError(new Error('something weird'))).toBeInstanceOf(BadRequest);
        });
    });

    describe('Normalizer edge cases (Polymarket)', () => {
        test('market with non-numeric outcomePrices does not crash', async () => {
            mockedAxios.get.mockResolvedValue({
                data: [{
                    id: 'event-1', title: 'Test Event',
                    markets: [{
                        id: 'market-1', question: 'Will it happen?',
                        outcomes: '["Yes","No"]',
                        outcomePrices: '["abc","def"]',
                        clobTokenIds: '["111111111111","222222222222"]',
                    }],
                }],
            });
            expect(Array.isArray(await poly.fetchMarkets({ limit: 5 }))).toBe(true);
        });

        test('fetchOHLCV normalizer handles empty history gracefully', async () => {
            (mockedAxios as any).request.mockResolvedValue({ data: { history: [] } });
            const candles = await poly.fetchOHLCV(VALID_OUTCOME_ID, { resolution: '1h' });
            expect(candles).toEqual([]);
        });
    });

    describe('Input validation', () => {
        test('fetchOrderBook with empty string id throws ValidationError', async () => {
            await expect(poly.fetchOrderBook('')).rejects.toThrow(ValidationError);
        });

        test('fetchOrderBook with whitespace-only id throws ValidationError', async () => {
            await expect(poly.fetchOrderBook('   ')).rejects.toThrow(ValidationError);
        });

        test('fetchOHLCV with empty id throws ValidationError', async () => {
            await expect(poly.fetchOHLCV('', { resolution: '1h' })).rejects.toThrow(ValidationError);
        });

        test('fetchOHLCV with missing resolution throws', async () => {
            await expect(poly.fetchOHLCV(VALID_OUTCOME_ID, {} as any)).rejects.toThrow(/resolution/i);
        });

        test('fetchTrades with empty id throws ValidationError', async () => {
            await expect(poly.fetchTrades('', { limit: 10 })).rejects.toThrow(ValidationError);
        });

        test('fetchOHLCV with short numeric id throws ValidationError', async () => {
            await expect(poly.fetchOHLCV('12345', { resolution: '1h' })).rejects.toThrow(ValidationError);
        });
    });

    describe('Limitless edge cases', () => {
        let limitless: LimitlessExchange;
        beforeEach(() => { limitless = new LimitlessExchange(); });

        test('fetchMarkets with status "closed" returns empty without network call', async () => {
            expect(await limitless.fetchMarkets({ status: 'closed' })).toEqual([]);
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        test('fetchMarkets with status "inactive" returns empty without network call', async () => {
            expect(await limitless.fetchMarkets({ status: 'inactive' })).toEqual([]);
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        test('fetchOrder always throws (unsupported method)', async () => {
            await expect(limitless.fetchOrder('some-id')).rejects.toThrow(/not supported/i);
        });

        test('fetchOrderBook throws on API error', async () => {
            (mockedAxios as any).request.mockRejectedValue(new Error('server error'));
            await expect(limitless.fetchOrderBook('some-market-slug')).rejects.toThrow();
        });
    });

    describe('Authentication guards', () => {
        test('Polymarket createOrder without credentials throws AuthenticationError', async () => {
            await expect(
                new PolymarketExchange().createOrder({
                    marketId: 'mkt-1', outcomeId: 'out-1',
                    side: 'buy', type: 'limit', amount: 10, price: 0.5,
                }),
            ).rejects.toThrow(AuthenticationError);
        });

        test('Polymarket fetchPositions without address/auth throws AuthenticationError', async () => {
            await expect(new PolymarketExchange().fetchPositions()).rejects.toThrow(AuthenticationError);
        });

        test('Limitless fetchMyTrades without auth throws AuthenticationError', async () => {
            await expect(new LimitlessExchange().fetchMyTrades()).rejects.toThrow(AuthenticationError);
        });
    });
});
