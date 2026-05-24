import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import { BadRequest } from '../../errors';

export class OpinionErrorMapper extends ErrorMapper {
    constructor() {
        super('Opinion');
    }

    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            // OpenAPI format uses "msg", SDK format uses "errmsg"
            const message = data.msg || data.errmsg;
            if (message) {
                return `[${error.response.status}] ${message}`;
            }
        }
        return super.extractErrorMessage(error);
    }

    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        if (typeof data === 'object' && data !== null) {
            const obj = data as Record<string, unknown>;
            // OpenAPI format: { code: number, msg: string }
            // SDK format: { errno: number, errmsg: string }
            const errorCode = obj.code ?? obj.errno;
            const errorMsg = obj.msg || obj.errmsg || message;
            if (errorCode !== undefined && errorCode !== 0) {
                return new BadRequest(
                    `Opinion API error (code ${errorCode}): ${errorMsg}`,
                    this.exchangeName,
                );
            }
        }
        return super.mapBadRequestError(message, data);
    }
}

export const opinionErrorMapper = new OpinionErrorMapper();
