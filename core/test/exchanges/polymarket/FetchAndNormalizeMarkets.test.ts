import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket Markets Normalization Test
 * 
 * What: Tests the normalization of Polymarket's Gamma API response.
 * Why: Polymarket's API often returns outcomes and prices as stringified JSON.
 *      We need to ensure these are correctly parsed regardless of whether 
 *      the API returns them as strings or actual arrays.
 * How: Mocks various response formats from the Gamma API and validates the UnifiedMarket output.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - Fetch and Normalize Markets', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    const mockGammaResponse = [
        {
            id: "eventId1",
            title: "Presidential Election 2024",
            markets: [
                {
                    id: "marketId1",
                    question: "Winner",
                    volume_24h: 1000000,
                    outcomePrices: "[\"0.60\", \"0.40\"]", // Stringified JSON
                    outcomes: "[\"Candidate A\", \"Candidate B\"]", // Stringified JSON
                    rewards: { liquidity: 50000 }
                },
                {
                    id: "marketId2",
                    question: "Runner Up",
                    outcomes: ["A", "B"], // Actual array
                    outcomePrices: ["0.1", "0.9"], // Actual array
                    volume24hr: "500" // Alternative field name
                }
            ]
        }
    ];

    it('should correctly parse stringified and non-stringified outcomes/prices', async () => {
        mockedAxios.get.mockResolvedValue({ data: mockGammaResponse });

        const markets = await exchange.fetchMarkets();

        expect(markets).toHaveLength(2);

        // Check Market 1 (Stringified)
        const m1 = markets[0];
        expect(m1.id).toBe("marketId1");
        expect(m1.outcomes[0].label).toBe("Candidate A");
        expect(m1.outcomes[0].price).toBe(0.60);

        // Check Market 2 (Array)
        const m2 = markets[1];
        expect(m2.id).toBe("marketId2");
        expect(m2.outcomes[0].label).toBe("A");
        expect(m2.volume24h).toBe(500);
    });
});
