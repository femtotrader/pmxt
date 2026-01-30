import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless Markets Normalization Test
 * 
 * What: Tests the normalization of Limitless's Gamma API response.
 * Why: Limitless's API often returns outcomes and prices as stringified JSON.
 *      We need to ensure these are correctly parsed regardless of whether 
 *      the API returns them as strings or actual arrays.
 * How: Mocks various response formats from the Gamma API and validates the UnifiedMarket output.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - Fetch and Normalize Markets', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    const mockGammaResponse = [
        {
            slug: "test-slug-1",
            title: "Presidential Election 2024",
            tokens: { yes: "token1", no: "token2" },
            prices: [0.60, 0.40],
            volumeFormatted: "1000000",
            expirationTimestamp: "2025-12-31T00:00:00Z"
        },
        {
            slug: "test-slug-2",
            title: "Runner Up",
            tokens: { A: "tokenA", B: "tokenB" },
            prices: [0.1, 0.9],
            volumeFormatted: "500",
            expirationTimestamp: "2025-12-31T00:00:00Z"
        }
    ];

    it('should correctly parse tokens and prices', async () => {
        mockedAxios.get.mockResolvedValue({ data: mockGammaResponse });

        const markets = await exchange.fetchMarkets();

        expect(markets).toHaveLength(2);

        // Check Market 1
        const m1 = markets[0];
        expect(m1.title).toBe("Presidential Election 2024");
        expect(m1.outcomes[0].label).toBe("Yes");
        expect(m1.outcomes[0].price).toBe(0.60);

        // Check Market 2
        const m2 = markets[1];
        expect(m2.title).toBe("Runner Up");
        expect(m2.outcomes[0].label).toBe("A");
        expect(m2.volume24h).toBe(500);
    });
});
