import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless Data Validation Test
 * 
 * What: Tests handling of malformed, missing, or edge-case data from the API.
 * Why: Real-world APIs can return unexpected data structures that must be handled gracefully.
 * How: Mocks various edge cases and verifies robust parsing and fallback logic.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - Data Validation', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    it('should correctly parse tokens and prices into outcomes', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                slug: 'test',
                title: 'Test Event',
                tokens: { yes: 'token1', no: 'token2' },
                prices: [0.52, 0.48],
                expirationTimestamp: '2025-12-31T00:00:00Z',
                volumeFormatted: '100000'
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].outcomes.length).toBe(2);
        expect(markets[0].outcomes[0].label).toBe('Yes');
        expect(markets[0].outcomes[1].label).toBe('No');
        expect(markets[0].outcomes[0].price).toBe(0.52);
    });

    it('should handle missing volume fields with fallback', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                slug: 'test',
                title: 'Test Event',
                tokens: { yes: 'token1', no: 'token2' },
                prices: [0.52, 0.48],
                expirationTimestamp: '2025-12-31T00:00:00Z'
                // Missing volumeFormatted
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].volume24h).toBe(0);
        expect(markets[0].volume).toBe(0);
    });

    it('should capitalize token keys for labels', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                slug: 'test',
                title: 'Presidential Election',
                tokens: { trump: 'token1', biden: 'token2' },
                prices: [0.52, 0.48],
                expirationTimestamp: '2025-12-31T00:00:00Z',
                volumeFormatted: '100000'
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].outcomes[0].label).toBe('Trump');
        expect(markets[0].outcomes[1].label).toBe('Biden');
    });

    it('should handle market without tokens gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                slug: 'test',
                title: 'Test Event',
                // Missing tokens/prices
                expirationTimestamp: '2025-12-31T00:00:00Z',
                volumeFormatted: '100000'
            }]
        });

        const markets = await exchange.fetchMarkets();

        // Should return a market object but with empty outcomes (or however utils handles it)
        expect(markets.length).toBe(1);
        expect(markets[0].outcomes.length).toBe(0);
    });

    it('should handle missing prices gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                slug: 'test',
                title: 'Test Event',
                tokens: { yes: 'token1', no: 'token2' },
                // Missing prices
                expirationTimestamp: '2025-12-31T00:00:00Z',
                volumeFormatted: '100000'
            }]
        });

        const markets = await exchange.fetchMarkets();
        // Assuming utils requires BOTH tokens and prices to populate outcomes
        expect(markets[0].outcomes.length).toBe(0);
    });

});
