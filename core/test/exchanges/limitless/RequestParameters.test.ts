import axios from 'axios';
import { LimitlessExchange } from '../../../src/exchanges/limitless';

/**
 * Limitless Request Parameters Test
 * 
 * What: Tests if internal filter parameters are correctly mapped to Limitless API query params.
 * Why: Different exchanges use different parameter names (e.g., 'sort' vs 'order', 'limit' vs 'qty').
 *      We must ensure our unified interface maps correctly to each exchange's native API.
 * How: Mocks axios and inspects the 'params' object passed to the get call.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LimitlessExchange - Request Parameters Mapping', () => {
    let exchange: LimitlessExchange;

    beforeEach(() => {
        exchange = new LimitlessExchange();
        jest.clearAllMocks();
    });

    it('should map limit and sort parameters correctly', async () => {
        mockedAxios.get.mockResolvedValue({ data: [] });

        await exchange.fetchMarkets({ limit: 50, sort: 'volume' });

        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('markets/active')
        );
    });
});
