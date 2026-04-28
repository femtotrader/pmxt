import axios, { AxiosInstance } from 'axios';
import {
    AuthenticationError,
    NotFound,
    RateLimitExceeded,
    NetworkError,
    ExchangeNotAvailable,
    BadRequest,
} from '../errors';
import type {
    FetchMatchesParams,
    FetchEventMatchesParams,
    RouterMarketSearchParams,
    RouterEventSearchParams,
} from './types';

const DEFAULT_BASE_URL = 'https://api.pmxt.dev';

export class PmxtApiClient {
    private readonly http: AxiosInstance;

    constructor(apiKey: string, baseUrl?: string) {
        this.http = axios.create({
            baseURL: baseUrl ?? DEFAULT_BASE_URL,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30_000,
        });
    }

    async getMarketMatches(params: FetchMatchesParams): Promise<any> {
        const id = params.marketId ?? params.slug ?? params.url;
        if (!id) throw new BadRequest('One of marketId, slug, or url is required', 'Router');

        const query: Record<string, string> = {};
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = String(params.minConfidence);
        if (params.limit !== undefined) query.limit = String(params.limit);
        if (params.includePrices) query.includePrices = 'true';

        const res = await this.request('GET', `/v0/markets/${encodeURIComponent(id)}/matches`, query);
        return res.data;
    }

    async getEventMatches(params: FetchEventMatchesParams): Promise<any> {
        const id = params.eventId ?? params.slug;
        if (!id) throw new BadRequest('One of eventId or slug is required', 'Router');

        const query: Record<string, string> = {};
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = String(params.minConfidence);
        if (params.limit !== undefined) query.limit = String(params.limit);
        if (params.includePrices) query.includePrices = 'true';

        const res = await this.request('GET', `/v0/events/${encodeURIComponent(id)}/matches`, query);
        return res.data;
    }

    async browseEventMatches(params: FetchEventMatchesParams): Promise<any> {
        const query: Record<string, string> = {};
        if (params.query) query.query = params.query;
        if (params.category) query.category = params.category;
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = String(params.minConfidence);
        if (params.limit !== undefined) query.limit = String(params.limit);

        const res = await this.request('GET', '/v0/events/matches', query);
        return res.data;
    }

    async searchMarkets(params?: RouterMarketSearchParams): Promise<any> {
        const query: Record<string, string> = {};
        if (params?.query) query.q = params.query;
        if (params?.sourceExchange) query.sourceExchange = params.sourceExchange;
        if (params?.category) query.category = params.category;
        if (params?.limit !== undefined) query.limit = String(params.limit);
        if (params?.offset !== undefined) query.offset = String(params.offset);
        if (params?.closed) query.closed = 'true';
        const res = await this.request('GET', '/v0/markets', query);
        return res.data;
    }

    async searchEvents(params?: RouterEventSearchParams): Promise<any> {
        const query: Record<string, string> = {};
        if (params?.query) query.q = params.query;
        if (params?.sourceExchange) query.sourceExchange = params.sourceExchange;
        if (params?.category) query.category = params.category;
        if (params?.limit !== undefined) query.limit = String(params.limit);
        if (params?.offset !== undefined) query.offset = String(params.offset);
        if (params?.closed) query.closed = 'true';
        const res = await this.request('GET', '/v0/events', query);
        return res.data;
    }

    async getArbitrage(query?: Record<string, string>): Promise<any> {
        const res = await this.request('GET', '/v0/arbitrage', query);
        return res.data;
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    private async request(
        method: string,
        path: string,
        query?: Record<string, string>,
    ): Promise<{ data: any }> {
        try {
            const response = await this.http.request({
                method,
                url: path,
                params: query,
            });
            return response.data;
        } catch (error: any) {
            throw this.mapError(error);
        }
    }

    private mapError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message =
                error.response?.data?.error ??
                error.response?.data?.message ??
                error.message;

            switch (status) {
                case 401:
                    return new AuthenticationError(message, 'Router');
                case 404:
                    return new NotFound(message, 'Router');
                case 429: {
                    const retryAfter = error.response?.headers?.['retry-after'];
                    return new RateLimitExceeded(
                        message,
                        retryAfter ? parseInt(retryAfter, 10) : undefined,
                        'Router',
                    );
                }
                case 400:
                    return new BadRequest(message, 'Router');
                default:
                    if (status && status >= 500) {
                        return new ExchangeNotAvailable(
                            `Router API error (${status}): ${message}`,
                            'Router',
                        );
                    }
                    return new BadRequest(message, 'Router');
            }
        }

        if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
            return new NetworkError(`Network error: ${error.message}`, 'Router');
        }

        return error instanceof Error ? error : new Error(String(error));
    }
}
