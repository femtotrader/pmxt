import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi Volume Fallback Test
 * 
 * What: Tests the fallback logic for volume reporting.
 * Why: Kalshi sometimes omits volume_24h for certain markets. In these cases, 
 *      we fall back to total volume to ensure we don't display 0 volume for active markets.
 * How: Mocks a market with 0 volume_24h but non-zero total volume.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - Volume Fallback Mechanism', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should fallback to total volume if 24h volume is missing or zero', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                events: [{
                    event_ticker: 'KXTEST',
                    title: 'Test Event',
                    markets: [{
                        ticker: 'KXTEST-001',
                        volume: 5000,
                        volume_24h: 0,
                        expiration_time: "2024-12-31T00:00:00Z"
                    }]
                }],
                cursor: ''
            }
        });

        const markets = await exchange.fetchMarkets();
        expect(markets[0].volume24h).toBe(5000);
    });
});
