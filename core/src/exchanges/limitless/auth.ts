import { HttpClient } from '@limitless-exchange/sdk';
import { Wallet } from 'ethers';
import { ExchangeCredentials } from '../../BaseExchange';

const DEFAULT_LIMITLESS_HOST = process.env.LIMITLESS_BASE_URL || 'https://api.limitless.exchange';

export interface HMACCredentials {
    tokenId: string;
    secret: string;
}

/**
 * Manages Limitless authentication.
 *
 * Supports two modes:
 *  1. API key + private key (individual signer — EIP-712 order signing)
 *  2. HMAC credentials (partner/delegated signing — no private key needed)
 */
export class LimitlessAuth {
    private credentials: ExchangeCredentials;
    private signer?: Wallet;
    private httpClient?: HttpClient;
    private apiKey?: string;
    private hmacCreds?: HMACCredentials;
    readonly host: string;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;
        this.host = credentials.baseUrl || DEFAULT_LIMITLESS_HOST;

        // HMAC credentials for delegated signing (partner mode).
        // apiSecret is the base64-encoded HMAC secret from the Limitless dashboard.
        if (credentials.apiKey && credentials.apiSecret) {
            this.hmacCreds = {
                tokenId: credentials.apiKey,
                secret: credentials.apiSecret,
            };
        }

        // API key for legacy X-API-Key header auth.
        this.apiKey = credentials.apiKey || process.env.LIMITLESS_API_KEY;

        if (!this.apiKey && !this.hmacCreds) {
            throw new Error(
                'Limitless requires an API key. Set LIMITLESS_API_KEY environment variable or provide apiKey in credentials.'
            );
        }

        // Initialize signer if private key is provided (needed for EIP-712 order signing).
        if (credentials.privateKey) {
            let privateKey = credentials.privateKey;
            if (privateKey.includes('\\n')) {
                privateKey = privateKey.replace(/\\n/g, '\n');
            }
            this.signer = new Wallet(privateKey);
        }
    }

    getApiKey(): string {
        if (!this.apiKey) {
            throw new Error('[limitless] apiKey is required for authenticated requests');
        }
        return this.apiKey;
    }

    /**
     * Get or create the HTTP client.
     * Uses HMAC auth when credentials are available (delegated signing),
     * otherwise falls back to the legacy X-API-Key header.
     */
    getHttpClient(): HttpClient {
        if (this.httpClient) {
            return this.httpClient;
        }

        const config: Record<string, unknown> = {
            baseURL: this.host,
            timeout: 30000,
        };

        if (this.hmacCreds) {
            config.hmacCredentials = this.hmacCreds;
        } else if (this.apiKey) {
            config.apiKey = this.apiKey;
        }

        this.httpClient = new HttpClient(config as any);
        return this.httpClient;
    }

    getSigner(): Wallet {
        if (!this.signer) {
            throw new Error(
                'Wallet signer not available. Provide privateKey in credentials to sign orders.'
            );
        }
        return this.signer;
    }

    getAddress(): string {
        if (!this.signer) {
            throw new Error('Signer not initialized. Provide privateKey in credentials.');
        }
        return this.signer.address;
    }

    hasSigner(): boolean {
        return !!this.signer;
    }

    /** True when HMAC credentials are present and no private key — delegated signing mode. */
    isDelegatedSigning(): boolean {
        return !!this.hmacCreds && !this.signer;
    }

    reset(): void {
        this.httpClient = undefined;
    }
}
