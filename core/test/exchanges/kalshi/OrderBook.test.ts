import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';

/**
 * Kalshi fetchOrderBook() Test
 * 
 * What: Tests fetching and parsing of order book data (bids/asks).
 * Why: Order book data is critical for trading and price discovery.
 * How: Mocks Kalshi orderbook API responses and verifies correct parsing and sorting.
 */

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KalshiExchange - fetchOrderBook', () => {
    let exchange: KalshiExchange;

    beforeEach(() => {
        exchange = new KalshiExchange();
        jest.clearAllMocks();
    });

    it('should parse orderbook data correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [
                        [5200, 100],  // price in cents, quantity
                        [5100, 250],
                        [5000, 500]
                    ],
                    no: [
                        [4800, 150],
                        [4900, 200],
                        [5000, 300]
                    ]
                }
            }
        });

        const orderbook = await exchange.fetchOrderBook('FED-25JAN-B4.75');

        expect(orderbook.bids).toBeDefined();
        expect(orderbook.asks).toBeDefined();
        expect(orderbook.bids.length).toBe(3);
        expect(orderbook.asks.length).toBe(3);
    });

    it('should convert prices from cents to decimals', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[5200, 100]],
                    no: [[4800, 100]]
                }
            }
        });

        const orderbook = await exchange.fetchOrderBook('TEST-MARKET');

        expect(orderbook.bids[0].price).toBe(52);  // 5200 / 100 = 52
        expect(orderbook.asks[0].price).toBe(-47);  // (100 - 4800) / 100 = -47
    });

    it('should sort bids in descending order', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [
                        [5000, 100],
                        [5200, 200],
                        [5100, 150]
                    ],
                    no: []
                }
            }
        });

        const orderbook = await exchange.fetchOrderBook('TEST-MARKET');

        expect(orderbook.bids[0].price).toBeGreaterThanOrEqual(orderbook.bids[1].price);
        expect(orderbook.bids[1].price).toBeGreaterThanOrEqual(orderbook.bids[2].price);
    });

    it('should sort asks in ascending order', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [],
                    no: [
                        [5000, 100],
                        [4800, 200],
                        [4900, 150]
                    ]
                }
            }
        });

        const orderbook = await exchange.fetchOrderBook('TEST-MARKET');

        expect(orderbook.asks[0].price).toBeLessThanOrEqual(orderbook.asks[1].price);
        expect(orderbook.asks[1].price).toBeLessThanOrEqual(orderbook.asks[2].price);
    });

    it('should handle empty orderbook', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [],
                    no: []
                }
            }
        });

        const orderbook = await exchange.fetchOrderBook('TEST-MARKET');

        expect(orderbook.bids).toEqual([]);
        expect(orderbook.asks).toEqual([]);
    });

    it('should include timestamp', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[5200, 100]],
                    no: [[4800, 100]]
                }
            }
        });

        const orderbook = await exchange.fetchOrderBook('TEST-MARKET');

        expect(orderbook.timestamp).toBeDefined();
        expect(typeof orderbook.timestamp).toBe('number');
    });

    it('should handle missing yes/no fields', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {}
            }
        });

        const orderbook = await exchange.fetchOrderBook('TEST-MARKET');

        expect(orderbook.bids).toEqual([]);
        expect(orderbook.asks).toEqual([]);
    });
});
