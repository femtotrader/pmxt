import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    BaseError,
    ExchangeNotAvailable,
    InvalidOrder,
    BadRequest,
    PermissionDenied,
} from '../../errors';

/**
 * Polymarket-specific error mapper
 *
 * Handles CLOB V2 error patterns. V2 returns `{ "error": "<message>" }` on all
 * error responses. The base ErrorMapper already extracts `data.error` when it is
 * a string, so no extractErrorMessage override is needed.
 *
 * V2-specific status codes handled here:
 *   425 Too Early  -- matching engine restarting (retryable)
 *   503 Service Unavailable -- exchange paused / cancel-only mode
 */
export class PolymarketErrorMapper extends ErrorMapper {
    constructor() {
        super('Polymarket');
    }

    /**
     * Override to handle Polymarket-specific error patterns
     *
     * V2 returns `{ "error": "<message>" }` as a plain string. The base class
     * handles this natively via `data.error` (string path). We keep the legacy
     * `errorMsg` path for any residual V1 responses (order submission still
     * returns `errorMsg` in some batch flows).
     */
    protected extractErrorMessage(error: any): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;

            // V2 format: { "error": "<message>" }
            if (typeof data.error === 'string') {
                return data.error;
            }

            // Legacy V1 format: { "errorMsg": "<message>" }
            if (data.errorMsg) {
                return data.errorMsg;
            }
        }

        return super.extractErrorMessage(error);
    }

    /**
     * Override to handle V2 status code 425 (Too Early -- matching engine restarting)
     */
    protected mapByStatusCode(status: number, message: string, data: any, response?: any): BaseError {
        if (status === 425) {
            return new ExchangeNotAvailable(
                `Matching engine restarting: ${message}`,
                this.exchangeName
            );
        }

        return super.mapByStatusCode(status, message, data, response);
    }

    /**
     * Override to detect Polymarket-specific error patterns in 400 responses
     */
    protected mapBadRequestError(message: string, data: any): BadRequest {
        const lowerMessage = message.toLowerCase();

        // Authentication errors surfaced as 400
        if (
            lowerMessage.includes('api key') ||
            lowerMessage.includes('proxy') ||
            lowerMessage.includes('signature type') ||
            lowerMessage.includes('l1 request headers')
        ) {
            return new AuthenticationError(message, this.exchangeName);
        }

        // Trading disabled / cancel-only mode -- exchange-level unavailability
        if (
            lowerMessage.includes('trading is currently disabled') ||
            lowerMessage.includes('trading is currently cancel-only')
        ) {
            return new ExchangeNotAvailable(message, this.exchangeName);
        }

        // Address banned or restricted
        if (
            lowerMessage.includes('address banned') ||
            lowerMessage.includes('closed only mode')
        ) {
            return new PermissionDenied(message, this.exchangeName);
        }

        // Order validation errors
        if (
            lowerMessage.includes('tick size') ||
            lowerMessage.includes('post-only order') ||
            lowerMessage.includes('duplicated') ||
            lowerMessage.includes('size lower than') ||
            lowerMessage.includes('invalid expiration') ||
            lowerMessage.includes('fok order') ||
            lowerMessage.includes('fak order')
        ) {
            return new InvalidOrder(message, this.exchangeName);
        }

        // Fall back to base error mapping
        return super.mapBadRequestError(message, data);
    }
}

// Export singleton instance for convenience
export const polymarketErrorMapper = new PolymarketErrorMapper();
