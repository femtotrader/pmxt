
import axios, { AxiosInstance } from 'axios';
import { Wallet, utils } from 'ethers';
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';

const LIMITLESS_API_URL = 'https://api.limitless.exchange';
const BASE_CHAIN_ID = 8453;

// EIP-712 Types
const ORDER_TYPES: Record<string, TypedDataField[]> = {
    Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "signer", type: "address" },
        { name: "taker", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "feeRateBps", type: "uint256" },
        { name: "side", type: "uint8" },
        { name: "signatureType", type: "uint8" },
    ]
};

export interface LimitlessOrderParams {
    marketSlug: string;
    outcomeId: string; // The token ID
    side: 'BUY' | 'SELL';
    price: number; // Price in DOLLARS (e.g. 0.50)
    amount: number; // Number of shares
    type?: 'limit' | 'market';
}

export class LimitlessClient {
    private api: AxiosInstance;
    private signer: Wallet;
    private sessionCookie?: string;
    private userId?: string;
    private marketCache: Record<string, any> = {};
    private userData: any;

    constructor(privateKey: string) {
        this.signer = new Wallet(privateKey);
        this.api = axios.create({
            baseURL: LIMITLESS_API_URL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    private async ensureAuth() {
        if (this.sessionCookie && this.userId) return;

        // 1. Get Signing Message
        const msgRes = await this.api.get('/auth/signing-message');
        const message = msgRes.data; // Raw string or specific property? Assuming raw string per YAML example 'return response.text'

        // 2. Sign Message
        const hexMessage = utils.hexlify(utils.toUtf8Bytes(message));
        const signature = await this.signer.signMessage(message);

        // 3. Login
        const loginRes = await this.api.post('/auth/login', {
            client: 'eoa'
        }, {
            headers: {
                'x-account': this.signer.address,
                'x-signing-message': hexMessage,
                'x-signature': signature
            }
        });

        // 4. Capture Cookie & User ID
        const setCookie = loginRes.headers['set-cookie'];
        if (setCookie) {
            // Extract limitless_session
            const sessionMatch = setCookie.find(c => c.startsWith('limitless_session='));
            if (sessionMatch) {
                this.sessionCookie = sessionMatch.split(';')[0];
            }
        }

        if (!this.sessionCookie) {
            // Fallback: Check if response has it in data (unlikely, but safe)
            // or if axios cookie jar handled it automatically (unlikely in node w/o config)
            throw new Error("Failed to retrieve session cookie from login response");
        }

        this.userId = loginRes.data.id;
        this.userData = loginRes.data;

        // Update default headers
        this.api.defaults.headers.common['Cookie'] = this.sessionCookie;
    }

    async getMarket(slug: string) {
        if (this.marketCache[slug]) return this.marketCache[slug];

        const res = await this.api.get(`/markets/${slug}`);
        const market = res.data;
        if (!market) throw new Error(`Market not found: ${slug}`);

        this.marketCache[slug] = market;
        return market;
    }

    async createOrder(params: LimitlessOrderParams) {
        await this.ensureAuth();

        const market = await this.getMarket(params.marketSlug);
        const venue = market.venue;
        if (!venue || !venue.exchange) {
            throw new Error(`Market ${params.marketSlug} has no venue exchange address`);
        }

        // Determine amounts
        // USDC has 6 decimals, Shares have 6 decimals (implied by example 1e6 scaling)
        const SCALING_FACTOR = 1_000_000;

        // Calculations based on side
        // BUY: Maker = USDC, Taker = Shares
        // SELL: Maker = Shares, Taker = USDC

        let makerAmount: number;
        let takerAmount: number;
        const price = params.price; // e.g. 0.50
        const amount = params.amount; // e.g. 10 shares

        if (params.side === 'BUY') {
            const totalCost = price * amount;
            makerAmount = Math.round(totalCost * SCALING_FACTOR); // USDC
            takerAmount = Math.round(amount * SCALING_FACTOR);    // Shares
        } else {
            // For SELL, we are providing SHARES to get USDC
            // Maker = Shares, Taker = USDC
            const totalProceeds = price * amount;
            makerAmount = Math.round(amount * SCALING_FACTOR);      // Shares
            takerAmount = Math.round(totalProceeds * SCALING_FACTOR); // USDC
        }

        // EIP-712 Domain
        const domain: TypedDataDomain = {
            name: "Limitless CTF Exchange",
            version: "1",
            chainId: BASE_CHAIN_ID, // 8453
            verifyingContract: venue.exchange
        };

        const sideInt = params.side === 'BUY' ? 0 : 1;
        const feeRateBps = this.userData?.rank?.feeRateBps ?? 0;

        const orderData = {
            salt: Date.now() + 86400000, // 24h expiry
            maker: this.signer.address,
            signer: this.signer.address,
            taker: "0x0000000000000000000000000000000000000000",
            tokenId: params.outcomeId, // Keep as string for now if big
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: "0",
            nonce: 0,
            feeRateBps: feeRateBps,
            side: sideInt,
            signatureType: 0 // EOA
        };

        // Sign
        const signature = await this.signer._signTypedData(domain, ORDER_TYPES, orderData);

        // Payload
        const payload = {
            order: {
                ...orderData,
                price: params.price, // Send float as per API
                signature
            },
            ownerId: this.userId,
            orderType: "GTC", // Force Limit Orders for now
            marketSlug: params.marketSlug
        };

        const res = await this.api.post('/orders', payload);
        return res.data;
    }

    async cancelOrder(orderId: string) {
        await this.ensureAuth();
        const res = await this.api.delete(`/orders/${orderId}`, {
            data: {}
        });
        return res.data;
    }

    async cancelAllOrders(marketSlug: string) {
        await this.ensureAuth();
        const res = await this.api.delete(`/orders/all/${marketSlug}`);
        return res.data;
    }

    async getOrders(marketSlug: string, statuses?: ('LIVE' | 'MATCHED' | 'CANCELLED' | 'FILLED')[]) {
        await this.ensureAuth();
        const params: any = {};
        if (statuses && statuses.length > 0) {
            params.statuses = statuses;
        }
        const res = await this.api.get(`/markets/${marketSlug}/user-orders`, { params });
        return res.data.orders || [];
    }
}
