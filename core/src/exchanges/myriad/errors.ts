import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import { BadRequest } from '../../errors';

export class MyriadErrorMapper extends ErrorMapper {
    constructor() {
        super('Myriad');
    }

    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            if (data.message) return data.message;
            if (data.error && typeof data.error === 'string') return data.error;
        }
        return super.extractErrorMessage(error);
    }

    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('insufficient') || lowerMessage.includes('liquidity')) {
            return new BadRequest(message, this.exchangeName);
        }
        return super.mapBadRequestError(message, data);
    }
}

export const myriadErrorMapper = new MyriadErrorMapper();
