import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi Empty Response Handling Test
 * 
 * What: Tests how the exchange handles empty responses from the API.
 * Why: APIs can return empty lists during maintenance or based on filters.
 *      The library must handle this gracefully without throwing errors.
 * How: Mocks an empty events array and verifies an empty market array is returned.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - Empty Response Handling', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should handle empty events array gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                events: [],
                cursor: ''
            }
        });

        const markets = await exchange.fetchMarkets();
        expect(markets).toEqual([]);
    });

    it('should handle missing events field gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {}
        });

        const markets = await exchange.fetchMarkets();
        expect(markets).toEqual([]);
    });
});
