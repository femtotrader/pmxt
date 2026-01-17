import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi Markets Normalization Test
 * 
 * What: Tests if Kalshi markets are correctly normalized from the event-based structure.
 * Why: Kalshi uses a hierarchical Event > Market structure. We need to ensured nested markets
 *      are correctly flattened and combined with their parent event metadata (title, category).
 * How: Mocks the Kalshi /events API response with nested markets and verifies the UnifiedMarket output.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - Fetch and Normalize Markets', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should correctly flatten nested markets from events', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                events: [{
                    event_ticker: 'KXINFLATION',
                    title: 'Inflation > 3%',
                    sub_title: 'CPI exceeds 3%',
                    category: 'Economics',
                    markets: [{
                        ticker: 'KXINFLATION24',
                        yes_ask: 45,
                        yes_bid: 43,
                        volume_24h: 1000,
                        expiration_time: "2024-12-31T00:00:00Z",
                        open_interest: 500,
                        last_price: 44
                    }]
                }],
                cursor: ''
            }
        });

        const markets = await exchange.fetchMarkets();

        expect(markets.length).toBe(1);
        const m = markets[0];
        expect(m.id).toBe('KXINFLATION24');
        expect(m.title).toBe('Inflation > 3%');
        expect(m.outcomes[0].price).toBe(0.44); // last_price / 100
        expect(m.volume24h).toBe(1000);
        expect(m.category).toBe('Economics');
    });
});
