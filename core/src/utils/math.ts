import { OrderBook, OrderLevel } from '../types';

export function getExecutionPrice(
    orderBook: OrderBook,
    side: 'buy' | 'sell',
    amount: number
): number {
    if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
    }

    const levels = side === 'buy' ? orderBook.asks : orderBook.bids;

    if (!levels || levels.length === 0) {
        return 0;
    }

    let remainingAmount = amount;
    let totalCost = 0;

    for (const level of levels) {
        if (remainingAmount <= 0) {
            break;
        }

        const fillSize = Math.min(remainingAmount, level.size);

        totalCost += fillSize * level.price;

        remainingAmount -= fillSize;
    }

    if (remainingAmount > 0) {
        return 0;
    }

    const executionPrice = totalCost / amount;
    return executionPrice;
}

export interface ExecutionPriceResult {
    price: number;
    filledAmount: number;
    fullyFilled: boolean;
}

export function getExecutionPriceDetailed(
    orderBook: OrderBook,
    side: 'buy' | 'sell',
    amount: number
): ExecutionPriceResult {
    if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
    }

    const levels = side === 'buy' ? orderBook.asks : orderBook.bids;

    if (!levels || levels.length === 0) {
        return {
            price: 0,
            filledAmount: 0,
            fullyFilled: false,
        };
    }

    let remainingAmount = amount;
    let totalCost = 0;
    let filledAmount = 0;

    for (const level of levels) {
        if (remainingAmount <= 0) {
            break;
        }

        const fillSize = Math.min(remainingAmount, level.size);

        totalCost += fillSize * level.price;
        filledAmount += fillSize;

        remainingAmount -= fillSize;
    }

    const fullyFilled = remainingAmount === 0;
    const executionPrice = filledAmount > 0 ? totalCost / filledAmount : 0;

    return {
        price: executionPrice,
        filledAmount,
        fullyFilled,
    };
}
