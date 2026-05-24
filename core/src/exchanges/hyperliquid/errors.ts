import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    BadRequest,
    InsufficientFunds,
    InvalidOrder,
    RateLimitExceeded,
} from '../../errors';

/**
 * Maps Hyperliquid API errors to PMXT unified error classes.
 *
 * Hyperliquid returns errors as plain strings or JSON objects in
 * the response body. Common patterns:
 *   - "User has no account" -> AuthenticationError
 *   - "Insufficient margin" -> InsufficientFunds
 *   - "Invalid order" -> InvalidOrder
 */
export class HyperliquidErrorMapper extends ErrorMapper {
    constructor() {
        super('Hyperliquid');
    }

    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            if (typeof data === 'string') {
                return `[${error.response.status}] ${data}`;
            }
            if (data.status === 'err' && data.response) {
                return `[${error.response.status}] ${data.response}`;
            }
        }
        return super.extractErrorMessage(error);
    }

    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        const lowerMessage = message.toLowerCase();
        const responseStr = typeof data === 'object' && data !== null && 'response' in data
            ? String((data as Record<string, unknown>).response).toLowerCase()
            : lowerMessage;

        if (responseStr.includes('insufficient margin') || responseStr.includes('not enough')) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        if (responseStr.includes('invalid order') || responseStr.includes('price out of range')) {
            return new InvalidOrder(message, this.exchangeName);
        }

        if (responseStr.includes('no account') || responseStr.includes('not authorized')) {
            return new AuthenticationError(message, this.exchangeName);
        }

        return super.mapBadRequestError(message, data);
    }

    mapError(error: unknown): ReturnType<ErrorMapper['mapError']> {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            const retryAfter = error.response.headers?.['retry-after'];
            const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
            return new RateLimitExceeded(
                this.extractErrorMessage(error),
                retryAfterSeconds,
                this.exchangeName,
            );
        }

        return super.mapError(error);
    }
}

export const hyperliquidErrorMapper = new HyperliquidErrorMapper();
