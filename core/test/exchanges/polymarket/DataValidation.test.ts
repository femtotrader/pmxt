import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket Data Validation Test
 * 
 * What: Tests handling of malformed, missing, or edge-case data from the API.
 * Why: Real-world APIs can return unexpected data structures that must be handled gracefully.
 * How: Mocks various edge cases and verifies robust parsing and fallback logic.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - Data Validation', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should handle stringified JSON in outcomes field', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',  // Stringified
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '100000'
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].outcomes.length).toBe(2);
        expect(markets[0].outcomes[0].label).toBe('Yes');
    });

    it('should handle array outcomes field', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: ['Yes', 'No'],  // Already parsed
                    outcomePrices: ['0.52', '0.48'],
                    clobTokenIds: ['token1', 'token2'],
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '100000'
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].outcomes.length).toBe(2);
    });

    it('should handle malformed JSON in outcomes gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '{invalid json}',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '100000'
                }]
            }]
        });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        const markets = await exchange.fetchMarkets();

        expect(consoleSpy).toHaveBeenCalled();
        expect(markets[0].outcomes.length).toBe(0);
        consoleSpy.mockRestore();
    });

    it('should handle missing volume fields with fallback', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z'
                    // Missing volume24hr and volume
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].volume24h).toBe(0);
        expect(markets[0].volume).toBe(0);
    });

    it('should handle alternative volume field names', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume_24h: '50000'  // Alternative field name
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].volume24h).toBe(50000);
    });

    it('should handle missing liquidity with nested fallback', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '100000',
                    rewards: { liquidity: 25000 }  // Nested liquidity
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].liquidity).toBe(25000);
    });

    it('should handle candidate name extraction for Yes/No markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Presidential Election',
                markets: [{
                    id: 'market-1',
                    question: 'Will Trump win?',
                    groupItemTitle: 'Trump',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '100000'
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].outcomes[0].label).toBe('Trump');
        expect(markets[0].outcomes[1].label).toBe('Not Trump');
    });

    it('should handle multi-outcome markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Winner Prediction',
                markets: [{
                    id: 'market-1',
                    question: 'Who will win?',
                    outcomes: '["Trump", "Biden", "RFK Jr", "Other"]',
                    outcomePrices: '["0.40", "0.35", "0.15", "0.10"]',
                    clobTokenIds: '["token1", "token2", "token3", "token4"]',
                    endDate: '2025-12-31T00:00:00Z',
                    volume24hr: '100000'
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].outcomes.length).toBe(4);
        expect(markets[0].outcomes[0].label).toBe('Trump');
        expect(markets[0].outcomes[3].label).toBe('Other');
    });

    it('should handle missing endDate with fallback', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [{
                id: 'event-1',
                slug: 'test',
                title: 'Test Event',
                markets: [{
                    id: 'market-1',
                    question: 'Test?',
                    outcomes: '["Yes", "No"]',
                    outcomePrices: '["0.52", "0.48"]',
                    clobTokenIds: '["token1", "token2"]',
                    volume24hr: '100000'
                    // Missing endDate
                }]
            }]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets[0].resolutionDate).toBeInstanceOf(Date);
    });

    it('should skip events without markets', async () => {
        mockedAxios.get.mockResolvedValue({
            data: [
                {
                    id: 'event-1',
                    slug: 'test',
                    title: 'Test Event'
                    // Missing markets field
                },
                {
                    id: 'event-2',
                    slug: 'test2',
                    title: 'Test Event 2',
                    markets: [{
                        id: 'market-1',
                        question: 'Test?',
                        outcomes: '["Yes", "No"]',
                        outcomePrices: '["0.52", "0.48"]',
                        clobTokenIds: '["token1", "token2"]',
                        endDate: '2025-12-31T00:00:00Z',
                        volume24hr: '100000'
                    }]
                }
            ]
        });

        const markets = await exchange.fetchMarkets();

        expect(markets.length).toBe(1);
        expect(markets[0].id).toBe('market-1');
    });
});
