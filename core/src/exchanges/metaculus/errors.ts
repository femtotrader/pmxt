import { ErrorMapper } from '../../utils/error-mapper';
import {
    NotFound,
    MarketNotFound,
    AuthenticationError,
    PermissionDenied,
    BadRequest,
    InvalidOrder,
    BaseError,
} from '../../errors';

/**
 * Metaculus-specific error mapper.
 *
 * Extends the base error mapper with:
 * - 404: question/market not-found detection
 * - 401: actionable message pointing users to pass { apiToken }
 * - 403: distinguishes missing auth (-> AuthenticationError) from insufficient permissions
 * - 400: probability validation errors from the forecast API
 */
export class MetaculusErrorMapper extends ErrorMapper {
    constructor() {
        super('Metaculus');
    }

    protected override mapNotFoundError(message: string, _data: any): NotFound {
        const lower = message.toLowerCase();
        if (lower.includes('question') || lower.includes('market')) {
            const match = message.match(/[\d]+/);
            const id = match ? match[0] : 'unknown';
            return new MarketNotFound(id, this.exchangeName);
        }
        return new NotFound(message, this.exchangeName);
    }

    protected override mapBadRequestError(message: string, data: any): BadRequest {
        const lower = message.toLowerCase();

        // Probability validation errors from the forecast API
        if (
            lower.includes('probability') ||
            lower.includes('continuous_cdf') ||
            lower.includes('forecast')
        ) {
            return new InvalidOrder(
                `Metaculus forecast rejected: ${message}`,
                this.exchangeName,
            );
        }

        return super.mapBadRequestError(message, data);
    }

    /**
     * Override the top-level mapByStatusCode for Metaculus-specific auth messages.
     */
    protected override mapByStatusCode(
        status: number,
        message: string,
        data: any,
        response?: any,
    ): BaseError {
        if (status === 401) {
            return new AuthenticationError(
                'Metaculus API token required. Pass { apiToken: "..." } when constructing MetaculusExchange.',
                this.exchangeName,
            );
        }
        if (status === 403) {
            const lower = message.toLowerCase();
            // Metaculus returns 403 both for missing auth and insufficient permissions.
            // Distinguish by checking if the message mentions authentication.
            if (lower.includes('authenticated') || lower.includes('api token') || lower.includes('log in')) {
                return new AuthenticationError(
                    'Metaculus API token required. Pass { apiToken: "..." } when constructing MetaculusExchange.',
                    this.exchangeName,
                );
            }
            // Feature-gated 403: API forecasting not enabled for the account
            if (lower.includes('api_forecasting_not_enabled')) {
                return new PermissionDenied(
                    'Metaculus API forecasting is not enabled for your account. '
                    + 'Visit your Metaculus account settings to enable it, or contact Metaculus support.',
                    this.exchangeName,
                );
            }
            return new PermissionDenied(
                'You do not have permission for this operation. '
                + 'Check your Metaculus account permissions and API token scope.',
                this.exchangeName,
            );
        }
        return super.mapByStatusCode(status, message, data, response);
    }
}

export const metaculusErrorMapper = new MetaculusErrorMapper();
