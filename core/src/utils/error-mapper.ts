import axios, { AxiosError } from 'axios';
import {
    BaseError,
    BadRequest,
    AuthenticationError,
    PermissionDenied,
    NotFound,
    OrderNotFound,
    MarketNotFound,
    RateLimitExceeded,
    InvalidOrder,
    InsufficientFunds,
    ValidationError,
    NetworkError,
    ExchangeNotAvailable,
} from '../errors';

/**
 * A plain error-like object with an HTTP status and optional data payload.
 * Common in third-party SDKs (e.g. Polymarket clob-client) that don't throw
 * proper Error instances.
 */
interface PlainErrorObject {
    readonly status: number;
    readonly data?: unknown;
    readonly statusText?: string;
    readonly message?: string;
}

/** Type guard for plain error objects with numeric status codes. */
function isPlainErrorObject(value: unknown): value is PlainErrorObject {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Error) &&
        'status' in value &&
        typeof (value as PlainErrorObject).status === 'number'
    );
}

/**
 * An Error subclass with optional HTTP metadata attached by third-party SDKs.
 */
interface ErrorWithHttpMetadata extends Error {
    readonly status?: number;
    readonly statusCode?: number;
    readonly data?: unknown;
    readonly response?: {
        readonly status?: number;
        readonly statusCode?: number;
        readonly data?: unknown;
        readonly body?: unknown;
        readonly headers?: Record<string, string>;
    };
}

/** A Node.js-style error with an error code (e.g. ECONNREFUSED). */
interface NodeError extends Error {
    readonly code?: string;
}

/** Type guard for Node.js-style errors with a `code` property. */
function isNodeError(value: unknown): value is NodeError {
    return value instanceof Error && 'code' in value;
}

/**
 * Maps raw errors to PMXT unified error classes
 *
 * Handles axios errors, network errors, and exchange-specific error formats.
 * Can be extended by exchange-specific error mappers for custom error patterns.
 */
export class ErrorMapper {
    protected exchangeName?: string;

    constructor(exchangeName?: string) {
        this.exchangeName = exchangeName;
    }

    /**
     * Main entry point for error mapping
     */
    mapError(error: unknown): BaseError {
        // Already a BaseError, just add exchange context if missing
        if (error instanceof BaseError) {
            if (!error.exchange && this.exchangeName) {
                return new (error.constructor as new (...args: unknown[]) => BaseError)(
                    error.message,
                    this.exchangeName
                );
            }
            return error;
        }

        // Handle axios errors
        if (axios.isAxiosError(error)) {
            return this.mapAxiosError(error);
        }

        // Handle plain objects with status/data (e.g., Polymarket clob-client)
        if (isPlainErrorObject(error)) {
            const message = this.extractErrorMessage(error);
            return this.mapByStatusCode(error.status, message, error.data, error);
        }

        // Handle network errors
        if (isNodeError(error)) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
                return new NetworkError(
                    `Network error: ${error.message}`,
                    this.exchangeName
                );
            }
        }

        // Handle Error instances with attached HTTP metadata (common in third-party SDKs)
        if (error instanceof Error) {
            const err = error as ErrorWithHttpMetadata;
            const status = err.status ?? err.statusCode ?? err.response?.status ?? err.response?.statusCode;
            if (typeof status === 'number') {
                const message = this.extractErrorMessage(error);
                const data = err.data ?? err.response?.data ?? err.response?.body;
                return this.mapByStatusCode(status, message, data, err.response);
            }
        }

        // Generic error fallback
        const message = this.extractErrorMessage(error);
        return new BadRequest(message, this.exchangeName);
    }

    /**
     * Maps axios HTTP errors to appropriate error classes
     */
    protected mapAxiosError(error: AxiosError): BaseError {
        const status = error.response?.status;
        const message = this.extractErrorMessage(error);
        const data = error.response?.data;

        // Network/connection errors
        if (!status) {
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                return new NetworkError(
                    `Request timeout: ${message}`,
                    this.exchangeName
                );
            }
            return new ExchangeNotAvailable(
                `Exchange unreachable: ${message}`,
                this.exchangeName
            );
        }

        return this.mapByStatusCode(status, message, data, error.response);
    }

    /**
     * Maps an HTTP status code to the appropriate error class
     */
    protected mapByStatusCode(status: number, message: string, data: unknown, response?: unknown): BaseError {
        switch (status) {
            case 400:
                return this.mapBadRequestError(message, data);
            case 401:
                return new AuthenticationError(message, this.exchangeName);
            case 403:
                return new PermissionDenied(message, this.exchangeName);
            case 404:
                return this.mapNotFoundError(message, data);
            case 429:
                return this.mapRateLimitError(message, response);
            case 500:
            case 502:
            case 503:
            case 504:
                return new ExchangeNotAvailable(
                    `Exchange error (${status}): ${message}`,
                    this.exchangeName
                );
            default:
                return new BadRequest(
                    `HTTP ${status}: ${message}`,
                    this.exchangeName
                );
        }
    }

    /**
     * Maps 400 errors to specific bad request subtypes
     */
    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        const lowerMessage = message.toLowerCase();

        // Detect insufficient funds
        if (
            lowerMessage.includes('insufficient') ||
            lowerMessage.includes('balance') ||
            lowerMessage.includes('not enough')
        ) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        // Detect invalid order
        if (
            lowerMessage.includes('invalid order') ||
            lowerMessage.includes('invalid orderid') ||
            lowerMessage.includes('invalid order id') ||
            lowerMessage.includes('tick size') ||
            lowerMessage.includes('price must be') ||
            lowerMessage.includes('size must be') ||
            lowerMessage.includes('amount must be')
        ) {
            return new InvalidOrder(message, this.exchangeName);
        }

        // Detect validation errors
        if (lowerMessage.includes('validation') || lowerMessage.includes('invalid parameter')) {
            return new ValidationError(message, undefined, this.exchangeName);
        }

        return new BadRequest(message, this.exchangeName);
    }

    /**
     * Maps 404 errors to specific not found subtypes
     */
    protected mapNotFoundError(message: string, data: unknown): NotFound {
        const lowerMessage = message.toLowerCase();

        // Detect order not found (but not "order book" — that's a different resource)
        if (lowerMessage.includes('order') && !lowerMessage.includes('order book')) {
            // Try to extract order ID from message
            const orderIdMatch = message.match(/order[:\s]+([a-zA-Z0-9-]+)/i);
            const orderId = orderIdMatch ? orderIdMatch[1] : 'unknown';
            return new OrderNotFound(orderId, this.exchangeName);
        }

        // Detect market not found
        if (lowerMessage.includes('market')) {
            // Try to extract market ID from message
            const marketIdMatch = message.match(/market[:\s]+([a-zA-Z0-9-]+)/i);
            const marketId = marketIdMatch ? marketIdMatch[1] : 'unknown';
            return new MarketNotFound(marketId, this.exchangeName);
        }

        // Generic "not found" - could be order or market depending on context
        // Since we can't determine context here, return generic NotFound
        // The calling code (exchange implementations) should handle this appropriately
        return new NotFound(message, this.exchangeName);
    }

    /**
     * Maps rate limit errors
     */
    protected mapRateLimitError(message: string, response: unknown): RateLimitExceeded {
        // Try to extract retry-after from headers
        const headers = (
            typeof response === 'object' && response !== null && 'headers' in response
                ? (response as { headers?: Record<string, string> }).headers
                : undefined
        );
        const retryAfter = headers?.['retry-after'];
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

        return new RateLimitExceeded(message, retryAfterSeconds, this.exchangeName);
    }

    /**
     * Extracts error message from various error formats
     */
    protected extractErrorMessage(error: unknown): string {
        // Axios error with response data
        if (axios.isAxiosError(error) && error.response?.data) {
            const data: unknown = error.response.data;

            // Try various common error message paths
            if (typeof data === 'string') {
                return data;
            }

            if (typeof data === 'object' && data !== null) {
                const obj = data as Record<string, unknown>;

                if (obj.error) {
                    if (typeof obj.error === 'string') {
                        return obj.error;
                    }
                    if (typeof obj.error === 'object' && obj.error !== null && 'message' in obj.error) {
                        return String((obj.error as Record<string, unknown>).message);
                    }
                }

                if (typeof obj.message === 'string') {
                    return obj.message;
                }

                if (typeof obj.errorMsg === 'string') {
                    return obj.errorMsg;
                }
            }

            // Fallback to stringified data
            return JSON.stringify(data);
        }

        // Plain object with status and data (e.g., Polymarket clob-client errors)
        // These aren't AxiosError instances but have similar structure
        if (isPlainErrorObject(error)) {
            const data: unknown = error.data;

            if (data) {
                const extracted = this.extractFromData(data);
                if (extracted) {
                    return extracted;
                }
            }

            // Check for message at top level
            if (error.message && typeof error.message === 'string') {
                return error.message;
            }

            if (error.statusText && typeof error.statusText === 'string') {
                return error.statusText;
            }
        }

        // Standard Error object - check for attached response data from third-party SDKs
        if (error instanceof Error) {
            const err = error as ErrorWithHttpMetadata;
            const data: unknown = err.response?.data ?? err.data ?? (err as unknown as Record<string, unknown>).body;
            if (data) {
                const extracted = this.extractFromData(data);
                if (extracted) {
                    return extracted;
                }
            }
            return error.message;
        }

        // String error
        if (typeof error === 'string') {
            return error;
        }

        // Unknown error format
        if (typeof error === 'object' && error !== null) {
            try {
                return JSON.stringify(error, Object.getOwnPropertyNames(error));
            } catch {
                return String(error);
            }
        }
        return String(error);
    }

    /**
     * Extracts a message string from a response data payload
     */
    protected extractFromData(data: unknown): string | undefined {
        if (typeof data === 'string') {
            return data;
        }

        if (typeof data === 'object' && data !== null) {
            const obj = data as Record<string, unknown>;

            if (obj.error) {
                if (typeof obj.error === 'string') {
                    return obj.error;
                }
                if (typeof obj.error === 'object' && obj.error !== null && 'message' in obj.error) {
                    return String((obj.error as Record<string, unknown>).message);
                }
            }

            if (typeof obj.message === 'string') {
                return obj.message;
            }

            if (typeof obj.errorMsg === 'string') {
                return obj.errorMsg;
            }

            try {
                return JSON.stringify(data);
            } catch {
                return undefined;
            }
        }

        return undefined;
    }
}
