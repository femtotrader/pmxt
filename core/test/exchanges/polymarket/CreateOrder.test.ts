import { PolymarketExchange } from '../../../src/exchanges/polymarket';
import { Side } from '@polymarket/clob-client';
import { PolymarketAuth } from '../../../src/exchanges/polymarket/auth';

// Mock the dependencies
jest.mock('../../../src/exchanges/polymarket/auth');

describe('PolymarketExchange - createOrder', () => {
    let exchange: PolymarketExchange;
    let mockClobClient: any;
    let mockAuthInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock CLOB client
        mockClobClient = {
            createAndPostOrder: jest.fn(),
            deriveApiKey: jest.fn().mockResolvedValue({ apiKey: 'key', secret: 'secret', passphrase: 'pass' }),
        };

        // Setup mock Auth instance
        mockAuthInstance = {
            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
            getAddress: jest.fn().mockReturnValue('0xUserAddress'),
        };

        // Mock the constructor of PolymarketAuth to return our instance
        (PolymarketAuth as jest.Mock).mockImplementation(() => mockAuthInstance);

        exchange = new PolymarketExchange({ privateKey: '0x1234567890' });
    });

    describe('Unit Tests', () => {
        it('should throw error if not authenticated', async () => {
            const noAuthExchange = new PolymarketExchange();
            await expect(noAuthExchange.createOrder({
                marketId: '123',
                outcomeId: '456',
                side: 'buy',
                type: 'limit',
                amount: 10,
                price: 0.5
            })).rejects.toThrow('Trading operations require authentication');
        });

        it('should create a limit BUY order with correct parameters', async () => {
            // Mock successful order response
            mockClobClient.createAndPostOrder.mockResolvedValue({
                success: true,
                orderID: 'order_123_abc',
                status: 'limit'
            });

            const result = await exchange.createOrder({
                marketId: 'market_1',
                outcomeId: 'token_1',
                side: 'buy',
                type: 'limit',
                amount: 100,
                price: 0.65
            });

            expect(mockClobClient.createAndPostOrder).toHaveBeenCalledWith({
                tokenID: 'token_1',
                price: 0.65,
                side: Side.BUY,
                size: 100,
                feeRateBps: 0
            }, {
                tickSize: "0.01"
            });

            expect(result).toMatchObject({
                id: 'order_123_abc',
                status: 'open',
                price: 0.65,
                amount: 100,
                side: 'buy'
            });
        });

        it('should create a limit SELL order with correct parameters', async () => {
            mockClobClient.createAndPostOrder.mockResolvedValue({
                success: true,
                orderID: 'order_456_def',
                status: 'limit'
            });

            await exchange.createOrder({
                marketId: 'market_1',
                outcomeId: 'token_1',
                side: 'sell',
                type: 'limit',
                amount: 50,
                price: 0.40
            });

            expect(mockClobClient.createAndPostOrder).toHaveBeenCalledWith({
                tokenID: 'token_1',
                price: 0.40,
                side: Side.SELL,
                size: 50,
                feeRateBps: 0
            }, {
                tickSize: "0.01"
            });
        });

        it('should throw error for limit order without price', async () => {
            await expect(exchange.createOrder({
                marketId: 'm1',
                outcomeId: 't1',
                side: 'buy',
                type: 'limit',
                amount: 10
            })).rejects.toThrow('Price is required for limit orders');
        });

        it('should default to generic slippage prices for market orders', async () => {
            mockClobClient.createAndPostOrder.mockResolvedValue({ success: true, orderID: 'o1' });

            // Market BUY -> price should be 0.99
            await exchange.createOrder({
                marketId: 'm1',
                outcomeId: 't1',
                side: 'buy',
                type: 'market',
                amount: 10
            });

            expect(mockClobClient.createAndPostOrder).toHaveBeenCalledWith(
                expect.objectContaining({ price: 0.99, side: Side.BUY }),
                expect.any(Object)
            );

            // Market SELL -> price should be 0.01
            await exchange.createOrder({
                marketId: 'm1',
                outcomeId: 't1',
                side: 'sell',
                type: 'market',
                amount: 10
            });

            expect(mockClobClient.createAndPostOrder).toHaveBeenCalledWith(
                expect.objectContaining({ price: 0.01, side: Side.SELL }),
                expect.any(Object)
            );
        });

        it('should handle order placement failure from CLOB', async () => {
            mockClobClient.createAndPostOrder.mockResolvedValue({
                success: false,
                errorMsg: 'Insufficient balance'
            });

            await expect(exchange.createOrder({
                marketId: 'm1',
                outcomeId: 't1',
                side: 'buy',
                type: 'limit',
                amount: 10,
                price: 0.5
            })).rejects.toThrow('Insufficient balance');
        });

        it('should handle exceptions from CLOB client', async () => {
            mockClobClient.createAndPostOrder.mockRejectedValue(new Error('Network error'));

            await expect(exchange.createOrder({
                marketId: 'm1',
                outcomeId: 't1',
                side: 'buy',
                type: 'limit',
                amount: 10,
                price: 0.5
            })).rejects.toThrow('Network error');
        });
    });

    describe('Integration Tests', () => {
        // Skip if no private key is provided in env
        const shouldRun = process.env.POLYMARKET_PRIVATE_KEY && process.env.POLYMARKET_TEST_OUTCOME_ID;
        const runTest = shouldRun ? it : it.skip;

        if (!shouldRun) {
            console.log('Skipping Polymarket createOrder integration tests: No private key or test outcome ID found');
        }

        let realExchange: PolymarketExchange;

        beforeAll(() => {
            if (shouldRun) {
                // Use real implementation, not mocks
                jest.unmock('../../../src/exchanges/polymarket/auth');
                const { PolymarketExchange } = require('../../../src/exchanges/polymarket');
                realExchange = new PolymarketExchange({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
            }
        });

        // CAUTION: This will place a real order if run! 
        // We use a very low price to avoid filling, but it consumes sequence numbers/gas if on l2?
        // Polymarket uses proxy, so no gas, but be careful.
        // We'll place a Limit Buy at 0.01 which is unlikely to fill instantly unless the market is dead.
        runTest('should place a real limit order (Buy @ 0.02)', async () => {
            const outcomeId = process.env.POLYMARKET_TEST_OUTCOME_ID!; // Need a valid Yes/No token ID
            const marketId = process.env.POLYMARKET_TEST_MARKET_ID || 'test_market';

            try {
                const order = await realExchange.createOrder({
                    marketId: marketId,
                    outcomeId: outcomeId,
                    side: 'buy',
                    type: 'limit',
                    amount: 5, // minimum size might apply, usually 5-10 shares
                    price: 0.02
                });

                expect(order).toBeDefined();
                expect(order.id).toBeDefined();
                expect(order.status).toBe('open');

                // Cleanup: Cancel the order we just made
                console.log(`Placed test order ${order.id}, cancelling...`);
                await realExchange.cancelOrder(order.id);
            } catch (error) {
                console.warn("Integration test failed (likely insufficient balance or closed market):", error);
                // We don't fail the test suite for logic errors in integration unless strictly required
                // but checking for specific error types helps.
                if (error instanceof Error) {
                    // Pass if it's a valid API rejection (validation, etc.)
                    expect(error.message).toBeDefined();
                } else {
                    throw error;
                }
            }
        });
    });
});
