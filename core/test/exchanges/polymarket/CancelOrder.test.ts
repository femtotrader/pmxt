import { PolymarketExchange } from '../../../src/exchanges/polymarket';
import { PolymarketAuth } from '../../../src/exchanges/polymarket/auth';

// Mock the dependencies
jest.mock('../../../src/exchanges/polymarket/auth');

describe('PolymarketExchange - cancelOrder', () => {
    let exchange: PolymarketExchange;
    let mockClobClient: any;
    let mockAuthInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClobClient = {
            cancelOrder: jest.fn(),
        };

        mockAuthInstance = {
            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
        };

        (PolymarketAuth as jest.Mock).mockImplementation(() => mockAuthInstance);

        exchange = new PolymarketExchange({ privateKey: '0x1234567890' });
    });

    describe('Unit Tests', () => {
        it('should throw error if not authenticated', async () => {
            const noAuthExchange = new PolymarketExchange();
            await expect(noAuthExchange.cancelOrder('ord_123'))
                .rejects.toThrow('Trading operations require authentication');
        });

        it('should cancel an order successfully', async () => {
            mockClobClient.cancelOrder.mockResolvedValue({
                json: 'response', // structure varies, usually 200 OK
                status: 'OK'
            });

            const result = await exchange.cancelOrder('0xOrderHash');

            expect(mockClobClient.cancelOrder).toHaveBeenCalledWith({
                orderID: '0xOrderHash'
            });

            expect(result).toMatchObject({
                id: '0xOrderHash',
                status: 'cancelled',
                amount: 0,
                remaining: 0
            });
        });

        it('should handle cancellation errors', async () => {
            mockClobClient.cancelOrder.mockRejectedValue(new Error('Order not found'));

            await expect(exchange.cancelOrder('0xNonExistent'))
                .rejects.toThrow('Order not found');
        });
    });

    describe('Integration Tests', () => {
        const shouldRun = process.env.POLYMARKET_PRIVATE_KEY && process.env.POLYMARKET_TEST_OUTCOME_ID;
        const runTest = shouldRun ? it : it.skip;

        let realExchange: PolymarketExchange;

        beforeAll(() => {
            if (shouldRun) {
                jest.unmock('../../../src/exchanges/polymarket/auth');
                const { PolymarketExchange } = require('../../../src/exchanges/polymarket');
                realExchange = new PolymarketExchange({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
            }
        });

        runTest('should cancel a real order', async () => {
            const outcomeId = process.env.POLYMARKET_TEST_OUTCOME_ID!;
            const marketId = process.env.POLYMARKET_TEST_MARKET_ID || 'test_market';

            // 1. Create an order to cancel
            try {
                const order = await realExchange.createOrder({
                    marketId: marketId,
                    outcomeId: outcomeId,
                    side: 'buy',
                    type: 'limit',
                    amount: 5,
                    price: 0.02
                });

                console.log(`Placed order ${order.id} for cancellation test`);

                // 2. Cancel it
                const cancelResult = await realExchange.cancelOrder(order.id);

                expect(cancelResult.id).toBe(order.id);
                expect(cancelResult.status).toBe('cancelled');

            } catch (error) {
                console.warn("Integration test failed:", error);
                // Allow failure if it's just fund issues, but code path is exercised
                if (error instanceof Error && error.message.includes('Insufficient')) {
                    return;
                }
                throw error;
            }
        });
    });
});
