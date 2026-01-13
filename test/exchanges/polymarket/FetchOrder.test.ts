import { PolymarketExchange } from '../../../src/exchanges/polymarket';
import { PolymarketAuth } from '../../../src/exchanges/polymarket/auth';

jest.mock('../../../src/exchanges/polymarket/auth');

describe('PolymarketExchange - Order Fetching', () => {
    let exchange: PolymarketExchange;
    let mockClobClient: any;
    let mockAuthInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClobClient = {
            getOrder: jest.fn(),
            getOpenOrders: jest.fn(),
        };

        mockAuthInstance = {
            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
        };

        (PolymarketAuth as jest.Mock).mockImplementation(() => mockAuthInstance);

        exchange = new PolymarketExchange({ privateKey: '0x123' });
    });

    describe('fetchOrder', () => {
        it('should fetch single order details', async () => {
            mockClobClient.getOrder.mockResolvedValue({
                id: '0xOrder1',
                market: 'market_A',
                asset_id: 'token_A',
                side: 'BUY',
                order_type: 'GTC',
                price: '0.60',
                original_size: '100',
                size_matched: '10',
                status: 'LIVE',
                created_at: 1700000000
            });

            const order = await exchange.fetchOrder('0xOrder1');

            expect(mockClobClient.getOrder).toHaveBeenCalledWith('0xOrder1');
            expect(order).toEqual({
                id: '0xOrder1',
                marketId: 'market_A',
                outcomeId: 'token_A',
                side: 'buy',
                type: 'limit',
                price: 0.60,
                amount: 100,
                status: 'LIVE',
                filled: 10,
                remaining: 90,
                timestamp: 1700000000000
            });
        });
    });

    describe('fetchOpenOrders', () => {
        it('should fetch all open orders', async () => {
            mockClobClient.getOpenOrders.mockResolvedValue([
                {
                    id: '0xOrder1',
                    market: 'market_A',
                    asset_id: 'token_A',
                    side: 'BUY',
                    price: '0.60',
                    original_size: '100',
                    size_matched: '10',
                    size_left: '90',
                    created_at: 1700000000
                },
                {
                    id: '0xOrder2',
                    market: 'market_B',
                    asset_id: 'token_B',
                    side: 'SELL',
                    price: '0.40',
                    original_size: '50',
                    size_matched: '0',
                    created_at: 1700000005
                }
            ]);

            const orders = await exchange.fetchOpenOrders();

            expect(mockClobClient.getOpenOrders).toHaveBeenCalledWith({ market: undefined });
            expect(orders).toHaveLength(2);
            expect(orders[0].side).toBe('buy');
            expect(orders[1].side).toBe('sell');
            expect(orders[0].remaining).toBe(90);
        });

        it('should filter open orders by marketId', async () => {
            mockClobClient.getOpenOrders.mockResolvedValue([]);
            await exchange.fetchOpenOrders('mkt_1');
            expect(mockClobClient.getOpenOrders).toHaveBeenCalledWith({ market: 'mkt_1' });
        });

        it('should return empty array on specific error types or if null', async () => {
            mockClobClient.getOpenOrders.mockRejectedValue(new Error('Some error'));
            const logs = jest.spyOn(console, 'error').mockImplementation(() => { });

            const orders = await exchange.fetchOpenOrders();

            expect(orders).toEqual([]);
            expect(logs).toHaveBeenCalled();
            logs.mockRestore();
        });
    });
});
