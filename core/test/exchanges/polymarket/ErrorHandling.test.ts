import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';

/**
 * Polymarket Error Handling Test
 * 
 * What: Tests how the Polymarket exchange handle API errors and network failures.
 * Why: To ensure application stability when external services are unavailable.
 * How: Mocks a rejected axios promise and verifies that the exchange returns an empty 
 *      array instead of throwing, and logs the error.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketExchange - Error Handling', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();
    });

    it('should handle API errors by returning an empty list', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Network Error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        const markets = await exchange.fetchMarkets();

        expect(markets).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
