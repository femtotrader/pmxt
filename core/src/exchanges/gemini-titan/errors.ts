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
 * Maps Gemini Titan API errors to PMXT unified error classes.
 *
 * Gemini returns errors as JSON:
 *   { result: "error", reason: "InvalidSignature", message: "..." }
 *
 * Common reasons:
 *   - InvalidSignature -> AuthenticationError
 *   - InsufficientFunds -> InsufficientFunds
 *   - InvalidQuantity, InvalidPrice, MarketNotOpen -> InvalidOrder
 */
export class GeminiErrorMapper extends ErrorMapper {
    constructor() {
        super('GeminiTitan');
    }

    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            if (typeof data === 'string') {
                return `[${error.response.status}] ${data}`;
            }
            if (data.message) {
                return `[${error.response.status}] ${data.message}`;
            }
            if (data.reason) {
                return `[${error.response.status}] ${data.reason}`;
            }
        }
        return super.extractErrorMessage(error);
    }

    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        const reason = typeof data === 'object' && data !== null && 'reason' in data
            ? String((data as Record<string, unknown>).reason)
            : '';
        const lowerReason = reason.toLowerCase();
        const lowerMessage = message.toLowerCase();

        if (lowerReason.includes('insufficientfunds') || lowerMessage.includes('insufficient')) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        if (
            lowerReason.includes('invalidquantity') ||
            lowerReason.includes('invalidprice') ||
            lowerReason.includes('limitpriceofftick') ||
            lowerReason.includes('invalidstopprice') ||
            lowerReason.includes('marketnotopen') ||
            lowerReason.includes('unknowninstrument') ||
            lowerReason.includes('duplicateorder')
        ) {
            return new InvalidOrder(message, this.exchangeName);
        }

        if (
            lowerReason.includes('invalidsignature') ||
            lowerReason.includes('invalidapikey') ||
            lowerMessage.includes('terms_not_accepted')
        ) {
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

export const geminiErrorMapper = new GeminiErrorMapper();
