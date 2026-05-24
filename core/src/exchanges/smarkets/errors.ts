import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    BadRequest,
    ExchangeNotAvailable,
    InsufficientFunds,
    InvalidOrder,
    MarketNotFound,
    OrderNotFound,
    PermissionDenied,
    RateLimitExceeded,
} from '../../errors';

/**
 * Maps Smarkets error_type values to PMXT error classes.
 *
 * Smarkets errors follow the format:
 *   { "error_type": "ERROR_CODE", "data": "message or object" }
 */

const AUTHENTICATION_ERRORS = new Set([
    'INVALID_CREDENTIALS',
    'PASSWORD_RESET_NEEDED',
    'AUTH_REQUIRED',
]);

const RATE_LIMIT_ERRORS = new Set([
    'RATE_LIMIT_EXCEEDED',
    'EVENTS_API_RATE_LIMIT',
]);

const PERMISSION_DENIED_ERRORS = new Set([
    'USER_EXCLUDED',
    'USER_SUSPENDED',
    'SOURCE_BLOCKED',
    'IP_NOT_TRUSTED',
    'CLIENT_JURISDICTION_MISMATCH',
    'COUNTRY_BLOCKED',
    'FORBIDDEN',
    'ACCOUNT_UNVERIFIED',
]);

const INSUFFICIENT_FUNDS_ERRORS = new Set([
    'ORDER_REJECTED_INSUFFICIENT_FUNDS',
]);

const INVALID_ORDER_ERRORS = new Set([
    'ORDER_INVALID_INVALID_PRICE',
    'ORDER_INVALID_INVALID_QUANTITY',
    'ORDER_REJECTED_CROSSED_SELF',
    'ORDER_REJECTED_LIMIT_EXCEEDED',
    'ORDER_REJECTED_STAKE_LIMIT_EXCEEDED',
    'ORDER_REJECTED_CAPACITY_REACHED',
    'ORDER_REJECTED_CONTRACT_SETTLED',
    'ORDER_REJECTED_MARKET_SETTLED',
    'ORDER_REJECTED_MARKET_NOT_OPEN',
    'ORDER_REJECTED_MARKET_HALTED',
    'ORDER_CANCELLED_MARKET_HALTED',
    'ORDER_REJECTED_TRADING_SUSPENDED',
    'ORDER_CANCELLED_TRADING_SUSPENDED',
    'ORDER_REJECTED_ACCOUNT_SUSPENDED',
    'ORDER_REJECTED_THROTTLE_EXCEEDED',
]);

const MARKET_NOT_FOUND_ERRORS = new Set([
    'ORDER_REJECTED_MARKET_NOT_FOUND',
    'ORDER_REJECTED_CONTRACT_NOT_FOUND',
]);

const ORDER_NOT_FOUND_ERRORS = new Set([
    'ORDER_CANCEL_REJECTED_NOT_FOUND',
]);

const UNAVAILABLE_ERRORS = new Set([
    'INTERNAL_ERROR',
    'FOREX_SERVICE_INTERNAL_ERROR',
    'KYC_SERVICE_INTERNAL_ERROR',
    'MDS_SERVICE_UNAVAILABLE',
    'RECKONATOR_UNAVAILABLE',
    'AUTH_UNAVAILABLE',
    'ZEUS_CONNECTION_ERROR',
    'ZEUS_TIMEOUT',
    'ORDER_REJECTED_SERVICE_TEMPORARILY_UNAVAILABLE',
]);

/**
 * Smarkets-specific error mapper
 *
 * Handles Smarkets API error patterns where errors use an error_type
 * field to identify the error category.
 */
export class SmarketsErrorMapper extends ErrorMapper {
    constructor() {
        super('Smarkets');
    }

    /**
     * Override to handle the Smarkets { error_type, data } format
     */
    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const body = error.response.data;
            const errorType = body.error_type;
            const data = body.data;

            if (errorType) {
                const status = error.response.status;
                const detail = typeof data === 'string'
                    ? data
                    : data != null
                        ? JSON.stringify(data)
                        : '';
                return detail
                    ? `[${status}] ${errorType}: ${detail}`
                    : `[${status}] ${errorType}`;
            }
        }

        return super.extractErrorMessage(error);
    }

    /**
     * Override to map Smarkets error_type values before falling back
     * to the default status-code-based mapping
     */
    mapError(error: unknown): ReturnType<ErrorMapper['mapError']> {
        if (axios.isAxiosError(error) && error.response?.data) {
            const errorType: string | undefined = error.response.data.error_type;

            if (errorType) {
                const message = this.extractErrorMessage(error);
                const mapped = this.mapByErrorType(errorType, message, error.response);
                if (mapped) {
                    return mapped;
                }
            }
        }

        return super.mapError(error);
    }

    /**
     * Override to detect order-specific errors within 400 responses
     */
    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        const errorType: string | undefined =
            typeof data === 'object' && data !== null && 'error_type' in data
                ? String((data as Record<string, unknown>).error_type)
                : undefined;

        if (errorType) {
            if (INSUFFICIENT_FUNDS_ERRORS.has(errorType)) {
                return new InsufficientFunds(message, this.exchangeName);
            }
            if (INVALID_ORDER_ERRORS.has(errorType)) {
                return new InvalidOrder(message, this.exchangeName);
            }
            if (MARKET_NOT_FOUND_ERRORS.has(errorType)) {
                return new MarketNotFound(errorType, this.exchangeName);
            }
            if (ORDER_NOT_FOUND_ERRORS.has(errorType)) {
                return new OrderNotFound(errorType, this.exchangeName);
            }
        }

        return super.mapBadRequestError(message, data);
    }

    /**
     * Maps a Smarkets error_type string to a PMXT error class.
     * Returns undefined if the error_type is not recognized, allowing
     * the base class to handle it via HTTP status code.
     */
    private mapByErrorType(
        errorType: string,
        message: string,
        response: unknown
    ): ReturnType<ErrorMapper['mapError']> | undefined {
        if (AUTHENTICATION_ERRORS.has(errorType)) {
            return new AuthenticationError(message, this.exchangeName);
        }

        if (RATE_LIMIT_ERRORS.has(errorType)) {
            const headers = (
                typeof response === 'object' && response !== null && 'headers' in response
                    ? (response as { headers?: Record<string, string> }).headers
                    : undefined
            );
            const retryAfter = headers?.['retry-after'];
            const retryAfterSeconds = retryAfter
                ? parseInt(retryAfter, 10)
                : undefined;
            return new RateLimitExceeded(message, retryAfterSeconds, this.exchangeName);
        }

        if (PERMISSION_DENIED_ERRORS.has(errorType)) {
            return new PermissionDenied(message, this.exchangeName);
        }

        if (INSUFFICIENT_FUNDS_ERRORS.has(errorType)) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        if (INVALID_ORDER_ERRORS.has(errorType)) {
            return new InvalidOrder(message, this.exchangeName);
        }

        if (MARKET_NOT_FOUND_ERRORS.has(errorType)) {
            return new MarketNotFound(errorType, this.exchangeName);
        }

        if (ORDER_NOT_FOUND_ERRORS.has(errorType)) {
            return new OrderNotFound(errorType, this.exchangeName);
        }

        if (UNAVAILABLE_ERRORS.has(errorType)) {
            return new ExchangeNotAvailable(message, this.exchangeName);
        }

        // Catch-all for any *_UNAVAILABLE or *_TIMEOUT patterns not in the set
        if (errorType.endsWith('_UNAVAILABLE') || errorType.endsWith('_TIMEOUT')) {
            return new ExchangeNotAvailable(message, this.exchangeName);
        }

        return undefined;
    }
}

// Export singleton instance for convenience
export const smarketsErrorMapper = new SmarketsErrorMapper();
