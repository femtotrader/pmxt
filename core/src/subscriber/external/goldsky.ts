import { Trade } from '../../types';
import {
    BaseSubscriber,
    SubscribedActivityBuilder,
    SubscribedResult,
    SubscriberConfig,
    SubscriptionOption,
} from '../base';

// ----------------------------------------------------------------------------
// GoldSky Config
// ----------------------------------------------------------------------------

/**
 * A single GraphQL query to send to a Goldsky subgraph url.
 */
export interface GoldSkyGraphQlQuery {
    url: string;
    query: string;
    variables?: Record<string, any>;
}

/**
 * Executes a single GraphQL query and returns the `data` object, or `null` on
 * error. Provided by `GoldSkySubscriber` to each builder.
 */
export type GoldSkyFetch = (query: GoldSkyGraphQlQuery) => Promise<Record<string, unknown> | null>;

/**
 * Async builder that orchestrates one or more GraphQL queries and returns the
 * merged result.
 *
 * - Receives a `fetch` helper so it can chain requests sequentially or run
 *   them in parallel as needed.
 * - Return `null` when the requested `types` don't match what this builder
 *   covers (polling will be skipped for that address).
 * - Return an empty object `{}` when types match but the current query yields
 *   no results (however, polling continues and waiting for future changes).
 */
export type GoldSkySubscriptionBuilder = (
    address: string,
    types: SubscriptionOption[],
    fetch: GoldSkyFetch,
    baseUrl?: string,
) => Promise<Record<string, unknown> | null>;

export interface GoldSkyConfig extends Omit<SubscriberConfig, 'buildSubscription'> {
    buildSubscription: GoldSkySubscriptionBuilder;
}

// ----------------------------------------------------------------------------
// Polymarket endpoints
// ----------------------------------------------------------------------------

// Reference: https://docs.polymarket.com/market-data/subgraph
const POLYMARKET_TRADES_ENDPOINT =
    'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/prod/gn';

// NOTE: orderBy must use `id` (primary key) on pnl-subgraph and positions-subgraph.
// Sorting by any unindexed column (e.g. amount, balance) causes a statement timeout.

// ----------------------------------------------------------------------------
// Internal query builders
// ----------------------------------------------------------------------------

const TRADES_FIELDS = `
                id
                timestamp
                maker
                taker
                makerAssetId
                takerAssetId
                makerAmountFilled
                takerAmountFilled`;

const BUILD_POLYMARKET_TRADES_AS_MAKER_QUERY = (address: string, url?: string): GoldSkyGraphQlQuery => ({
    url: url ?? POLYMARKET_TRADES_ENDPOINT,
    query: `
        query GetPolymarketTradesMaker($address: Bytes!) {
            orderFilledEvents(
                where: { maker: $address }
                first: 5
                orderBy: timestamp
                orderDirection: desc
            ) {${TRADES_FIELDS}
            }
        }
    `,
    variables: { address: address.toLowerCase() },
});

const BUILD_POLYMARKET_TRADES_AS_TAKER_QUERY = (address: string, url?: string): GoldSkyGraphQlQuery => ({
    url: url ?? POLYMARKET_TRADES_ENDPOINT,
    query: `
        query GetPolymarketTradesTaker($address: Bytes!) {
            orderFilledEvents(
                where: { taker: $address }
                first: 20
                orderBy: timestamp
                orderDirection: desc
            ) {${TRADES_FIELDS}
            }
        }
    `,
    variables: { address: address.toLowerCase() },
});


// ----------------------------------------------------------------------------
// Exported subscription builders
// ----------------------------------------------------------------------------

/**
 * Polymarket combined subscription.
 *
 * - `'trades'`: two parallel indexed queries (maker + taker), merged and sorted
 *   by timestamp in the builder. The combined `or` filter causes a full-table
 *   scan and times out.
 * - `'positions'`: PNL and positions metadata run sequentially.
 *   Both use `orderBy: id` to avoid timeouts on unindexed sort columns; the
 *   builder re-sorts by `amount desc` after fetching.
 *
 * Pair with `buildPolymarketActivity`.
 */
export const POLYMARKET_DEFAULT_SUBSCRIPTION: GoldSkySubscriptionBuilder = async (address, types, goldSkyFetch, baseUrl?: string) => {
    if (!types.includes('trades')) return null;

    const [makerData, takerData] = await Promise.all([
        goldSkyFetch(BUILD_POLYMARKET_TRADES_AS_MAKER_QUERY(address, baseUrl)),
        goldSkyFetch(BUILD_POLYMARKET_TRADES_AS_TAKER_QUERY(address, baseUrl)),
    ]);

    const seen = new Set<string>();
    const trades: any[] = [];
    for (const row of [...(makerData?.orderFilledEvents as any[] ?? []), ...(takerData?.orderFilledEvents as any[] ?? [])]) {
        if (!seen.has(row.id)) {
            seen.add(row.id);
            trades.push(row);
        }
    }
    trades.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

    return { orderFilledEvents: trades };
};

/**
 * Limitless: watches ERC-20 `Transfer` events on the USDC contract.
 * Only active when `'balances'` is in the requested types.
 *
 * Pair with `buildLimitlessBalanceActivity`.
 */
export const LIMITLESS_DEFAULT_SUBSCRIPTION: GoldSkySubscriptionBuilder = async (address, types, fetch, baseUrl) => {
    if (!types.includes('balances') || !baseUrl) return null;
    return fetch({
        url: baseUrl,
        query: /* GraphQL */ `
            query WatchLimitlessAddress($address: Bytes!) {
                transfers(
                    where: { or: [{ from: $address }, { to: $address }] }
                    first: 1
                    orderBy: blockTimestamp
                    orderDirection: desc
                ) {
                    id
                    blockTimestamp
                    from
                    to
                    value
                }
            }
        `,
        variables: { address: address.toLowerCase() },
    });
};

// ----------------------------------------------------------------------------
// Activity builders
// ----------------------------------------------------------------------------

/**
 * Derives `Trade[]` from Polymarket CTF Exchange `OrderFilled` event data.
 */
export const buildPolymarketTradesActivity: SubscribedActivityBuilder = (data, address, types): SubscribedResult | null => {
    if (!types.includes('trades')) return null;
    const filled = (data as any)?.orderFilledEvents;
    if (!Array.isArray(filled) || filled.length === 0) return null;

    const addr = address.toLowerCase();
    const trades: Trade[] = filled.map((f: any): Trade => {
        const isMaker = (f.maker as string)?.toLowerCase() === addr;
        const currAssetId = BigInt(isMaker ? f.makerAssetId : f.takerAssetId);
        const isBuying = currAssetId === 0n;

        let shareAmount: number;
        let usdcAmount: number;
        if (isMaker) {
            if (isBuying) {
                usdcAmount = parseFloat(f.makerAmountFilled) / 1e6;
                shareAmount = parseFloat(f.takerAmountFilled) / 1e6;
            } else {
                shareAmount = parseFloat(f.makerAmountFilled) / 1e6;
                usdcAmount = parseFloat(f.takerAmountFilled) / 1e6;
            }
        } else {
            if (isBuying) {
                usdcAmount = parseFloat(f.takerAmountFilled) / 1e6;
                shareAmount = parseFloat(f.makerAmountFilled) / 1e6;
            } else {
                shareAmount = parseFloat(f.takerAmountFilled) / 1e6;
                usdcAmount = parseFloat(f.makerAmountFilled) / 1e6;
            }
        }

        return {
            id: f.id,
            timestamp: Number(f.timestamp) * 1000,
            price: shareAmount > 0 ? usdcAmount / shareAmount : 0,
            amount: shareAmount,
            side: isBuying ? 'buy' : 'sell',
            outcomeId: isMaker ? f.makerAssetId : f.takerAssetId,
        };
    });

    return { trades };
};

/**
 * Combined activity builder for Polymarket. Pair with `POLYMARKET_DEFAULT_SUBSCRIPTION`.
 *
 * Only handles trades from GoldSky on-chain data. Positions are always fetched
 * via the REST fallback because on-chain data lacks real market IDs and outcome labels.
 */
export const buildPolymarketActivity: SubscribedActivityBuilder = (data, address, types, lastSnapshot): SubscribedResult | null => {
    if (!types.includes('trades')) return null;
    return buildPolymarketTradesActivity(data, address, types, lastSnapshot);
};

/**
 * Derives a USDC balance delta from a Limitless ERC-20 transfer event.
 * Returns `null` to fall back to full RPC fetch when baseline is missing.
 */
export const buildLimitlessBalanceActivity: SubscribedActivityBuilder = (data, address, types, lastActivity): SubscribedResult | null => {
    if (!types.includes('balances')) return null;
    const transfers = (data as any)?.transfers;
    if (!Array.isArray(transfers) || transfers.length === 0) return null;

    const prev = lastActivity?.balances?.find(b => b.currency === 'USDC');
    if (!prev) return null;

    const t = transfers[0];
    const addr = address.toLowerCase();
    const isIncoming = (t.to as string)?.toLowerCase() === addr;
    const delta = parseFloat(t.value) / 1e6;
    const newTotal = Math.max(0, isIncoming ? prev.total + delta : prev.total - delta);

    return {
        balances: [{
            currency: 'USDC',
            total: newTotal,
            available: Math.max(0, newTotal - prev.locked),
            locked: prev.locked,
        }],
    };
};

// ----------------------------------------------------------------------------
// GoldSkySubscriber
// ----------------------------------------------------------------------------

/**
 * Polls goldsky subgraph endpoints on a configurable interval.
 *
 * Passes a `GoldSkyFetch` helper to each builder invocation, allowing builders
 * to chain requests sequentially or run them in parallel as needed.
 */
export class GoldSkySubscriber implements BaseSubscriber {
    readonly config: GoldSkyConfig;
    private readonly pollMs: number;

    private abortControllers = new Map<string, AbortController>();
    private pollTimers = new Map<string, ReturnType<typeof setInterval>>();
    private callbacks = new Map<string, (data: unknown) => void>();
    private addressQueryTypes = new Map<string, SubscriptionOption[]>();
    private closed = false;

    constructor(config: GoldSkyConfig) {
        this.config = config;
        this.pollMs = config.pollMs ?? 3000;
    }

    async subscribe(address: string, types: SubscriptionOption[], onEvent: (data: unknown) => void): Promise<void> {
        if (this.closed) return;

        this.callbacks.set(address, onEvent);
        this.addressQueryTypes.set(address, types);

        const existing = this.pollTimers.get(address);
        if (existing) {
            clearInterval(existing);
            this.pollTimers.delete(address);
        }

        const timer = setInterval(() => this.query(address), this.pollMs);
        this.pollTimers.set(address, timer);
    }

    unsubscribe(address: string): void {
        const timer = this.pollTimers.get(address);
        if (timer) {
            clearInterval(timer);
            this.pollTimers.delete(address);
        }
        this.abortControllers.get(address)?.abort();
        this.abortControllers.delete(address);
        this.callbacks.delete(address);
        this.addressQueryTypes.delete(address);
    }

    close(): void {
        this.closed = true;
        for (const address of [...this.pollTimers.keys()]) {
            this.unsubscribe(address);
        }
    }

    private async query(address: string): Promise<void> {
        const callback = this.callbacks.get(address);
        const types = this.addressQueryTypes.get(address);
        if (!callback || !types) return;

        this.abortControllers.get(address)?.abort();
        const controller = new AbortController();
        this.abortControllers.set(address, controller);

        const goldSkyFetch: GoldSkyFetch = (q) => this.runQuery(q, controller.signal);
        const data = await this.config.buildSubscription(address, types, goldSkyFetch, this.config.baseUrl);
        if (!data) return;

        callback(data);
    }

    private async runQuery(q: GoldSkyGraphQlQuery, signal: AbortSignal): Promise<Record<string, unknown> | null> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        try {
            const res = await fetch(q.url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query: q.query, variables: q.variables ?? {} }),
                signal,
            });
            if (!res.ok) {
                console.warn(`[GoldSkySubscriber] HTTP ${res.status} from ${q.url}`);
                return null;
            }
            const json = await res.json() as any;
            if (json?.errors) {
                console.warn(`[GoldSkySubscriber] GraphQL errors from ${q.url}:`, JSON.stringify(json.errors));
                return null;
            }
            return json?.data ?? null;
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                console.warn(`[GoldSkySubscriber] Fetch failed for ${q.url}:`, err);
            }
            return null;
        }
    }
}
