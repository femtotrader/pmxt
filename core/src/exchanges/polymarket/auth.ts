import { ClobClient } from '@polymarket/clob-client';
import type { ApiKeyCreds } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { ExchangeCredentials } from '../../BaseExchange';

const POLYMARKET_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

/**
 * Manages Polymarket authentication and CLOB client initialization.
 * Handles both L1 (wallet-based) and L2 (API credentials) authentication.
 */
export class PolymarketAuth {
    private credentials: ExchangeCredentials;
    private signer?: Wallet;
    private clobClient?: ClobClient;
    private apiCreds?: ApiKeyCreds;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;

        if (!credentials.privateKey) {
            throw new Error('Polymarket requires a privateKey for authentication');
        }

        // Initialize the signer
        this.signer = new Wallet(credentials.privateKey);
    }

    /**
     * Get or create API credentials using L1 authentication.
     * This uses the private key to derive/create API credentials.
     */
    async getApiCredentials(): Promise<ApiKeyCreds> {
        // Return cached credentials if available
        if (this.apiCreds) {
            return this.apiCreds;
        }

        // If credentials were provided, use them
        if (this.credentials.apiKey && this.credentials.apiSecret && this.credentials.passphrase) {
            this.apiCreds = {
                key: this.credentials.apiKey,
                secret: this.credentials.apiSecret,
                passphrase: this.credentials.passphrase,
            };
            return this.apiCreds;
        }

        // Otherwise, derive/create them using L1 auth
        const l1Client = new ClobClient(
            POLYMARKET_HOST,
            POLYGON_CHAIN_ID,
            this.signer
        );

        // Robust derivation strategy:
        // 1. Try to DERIVE existing credentials first (most common case).
        // 2. If that fails (e.g. 404 or 400), try to CREATE new ones.

        let creds: ApiKeyCreds | undefined;

        try {
            // console.log('Trying to derive existing API key...');
            creds = await l1Client.deriveApiKey();
        } catch (deriveError: any) {
            // console.log('Derivation failed, trying to create new API key...');
            try {
                creds = await l1Client.createApiKey();
            } catch (createError: any) {
                console.error('Failed to both derive and create API key:', createError?.message || createError);
                throw new Error('Authentication failed: Could not create or derive API key.');
            }
        }

        if (!creds) {
            throw new Error('Authentication failed: Credentials are empty.');
        }

        this.apiCreds = creds;
        return creds;
    }

    /**
     * Get an authenticated CLOB client for L2 operations (trading).
     * This client can place orders, cancel orders, query positions, etc.
     */
    async getClobClient(): Promise<ClobClient> {
        // Return cached client if available
        if (this.clobClient) {
            return this.clobClient;
        }

        // Get API credentials (L1 auth)
        const apiCreds = await this.getApiCredentials();

        // Determine signature type (default to EOA = 0)
        const signatureType = this.credentials.signatureType ?? 0;

        // Determine funder address (defaults to signer's address)
        const funderAddress = this.credentials.funderAddress ?? this.signer!.address;

        // Create L2-authenticated client
        this.clobClient = new ClobClient(
            POLYMARKET_HOST,
            POLYGON_CHAIN_ID,
            this.signer,
            apiCreds,
            signatureType,
            funderAddress
        );

        return this.clobClient;
    }

    /**
     * Get the signer's address.
     */
    getAddress(): string {
        return this.signer!.address;
    }

    /**
     * Reset cached credentials and client (useful for testing or credential rotation).
     */
    reset(): void {
        this.apiCreds = undefined;
        this.clobClient = undefined;
    }
}
