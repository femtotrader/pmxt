import { PolymarketExchange } from '../../../src/exchanges/polymarket';
import { PolymarketAuth } from '../../../src/exchanges/polymarket/auth';
import { AssetType, Side } from '@polymarket/clob-client';
import * as fetchPositionsModule from '../../../src/exchanges/polymarket/fetchPositions';

jest.mock('../../../src/exchanges/polymarket/auth');
jest.mock('../../../src/exchanges/polymarket/fetchPositions');

describe('PolymarketExchange - Balance & Positions', () => {
    let exchange: PolymarketExchange;
    let mockClobClient: any;
    let mockAuthInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClobClient = {
            getBalanceAllowance: jest.fn(),
            getOpenOrders: jest.fn(),
        };

        mockAuthInstance = {
            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
            getAddress: jest.fn().mockReturnValue('0xUser'),
        };

        (PolymarketAuth as jest.Mock).mockImplementation(() => mockAuthInstance);

        exchange = new PolymarketExchange({ privateKey: '0x123' });
    });

    describe('fetchBalance', () => {
        it('should calculate balance and locked funds correctly', async () => {
            // 1. Mock Raw Balance
            mockClobClient.getBalanceAllowance.mockResolvedValue({
                balance: '100000000' // 100 USDC (6 decimals)
            });

            // 2. Mock Open Orders (locking funds)
            // Buy orders lock funds: Price * Remaining Size
            mockClobClient.getOpenOrders.mockResolvedValue([
                {
                    side: Side.BUY,
                    price: '0.50',
                    original_size: '20',
                    size_matched: '0'
                }, // Locked: 0.50 * 20 = 10 USDC
                {
                    side: Side.BUY,
                    price: '0.10',
                    original_size: '100',
                    size_matched: '50' // remaining 50
                }, // Locked: 0.10 * 50 = 5 USDC
                {
                    side: Side.SELL, // Sells don't lock USDC (they lock shares)
                    price: '0.90',
                    original_size: '10',
                    size_matched: '0'
                }
            ]);

            const balances = await exchange.fetchBalance();

            expect(mockClobClient.getBalanceAllowance).toHaveBeenCalledWith({ asset_type: AssetType.COLLATERAL });
            expect(balances).toHaveLength(1);

            const usdc = balances[0];
            expect(usdc.currency).toBe('USDC');
            expect(usdc.total).toBe(100); // 100000000 / 1e6
            expect(usdc.locked).toBe(15); // 10 + 5
            expect(usdc.available).toBe(85); // 100 - 15
        });

        it('should handle zero balance and no orders', async () => {
            mockClobClient.getBalanceAllowance.mockResolvedValue({ balance: '0' });
            mockClobClient.getOpenOrders.mockResolvedValue([]);

            const balances = await exchange.fetchBalance();
            expect(balances[0].total).toBe(0);
            expect(balances[0].available).toBe(0);
            expect(balances[0].locked).toBe(0);
        });
    });

    describe('fetchPositions', () => {
        it('should delegate to fetchPositions module', async () => {
            const mockPositions = [{
                marketId: 'm1',
                outcomeId: 'o1',
                outcomeLabel: 'Yes',
                size: 10,
                entryPrice: 0.5,
                currentPrice: 0.6,
                unrealizedPnL: 1
            }];

            (fetchPositionsModule.fetchPositions as jest.Mock).mockResolvedValue(mockPositions);

            const positions = await exchange.fetchPositions();

            expect(mockAuthInstance.getAddress).toHaveBeenCalled();
            expect(fetchPositionsModule.fetchPositions).toHaveBeenCalledWith('0xUser');
            expect(positions).toEqual(mockPositions);
        });
    });
});
