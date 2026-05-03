import { ValidationError } from '../errors';

/**
 * Validates that the provided ID is an outcomeId
 * Numeric IDs should be at least 10 digits (CLOB Token IDs for Polymarket)
 */
export function validateOutcomeId(id: string, context: string): void {
    // Polymarket: CLOB Token IDs are long (>= 10 digits)
    // Short numeric IDs are invalid for trading operations
    if (id.length < 10 && /^\d+$/.test(id)) {
        throw new ValidationError(
            `Invalid outcome ID for ${context}: "${id}". ` +
            `fetchOrderBook requires an outcome token ID, not a market slug or condition ID. ` +
            `Use fetchMarkets to find the market, then pass market.yes.outcomeId or market.no.outcomeId.`,
            'id'
        );
    }
}

export function validateIdFormat(id: string, context: string): void {
    if (!id || id.trim().length === 0) {
        throw new ValidationError(
            `Invalid ID for ${context}: ID cannot be empty`,
            'id'
        );
    }
}
