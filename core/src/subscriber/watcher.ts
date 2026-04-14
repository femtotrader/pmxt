import { QueuedPromise, Trade } from '../types';
import {
    BaseSubscriber,
    SubscribedActivityBuilder,
    SubscribedAddressSnapshot,
    SubscriberConfig,
    SubscriptionOption,
} from './base';

export type FetchFn = (address: string, types: SubscriptionOption[]) => Promise<SubscribedAddressSnapshot>;


// ----------------------------------------------------------------------------
// Configs
// ----------------------------------------------------------------------------

export interface AddressWatcherConfig {
    /**
     * Subscriber. Responsible for polling or pushing on-chain events
     * for each watched address. When an event arrives, the watcher fetches only
     * the activity types that could not be derived from the event data.
     */
    subscriber: BaseSubscriber;

    /**
     * Optional function to extract partial activity directly from the raw
     * subscription event data, avoiding REST/RPC calls for the types
     * it can populate.
     *
     * Pair with the matching subscription builder in GoldSkySubscriber:
     * - `POLYMARKET_TRADES_SUBSCRIPTION` + `buildPolymarketTradesActivity`
     * - `LIMITLESS_DEFAULT_SUBSCRIPTION` + `buildLimitlessBalanceActivity`
     *
     * Return `null` to fall back to a full REST/RPC fetch for every event.
     */
    buildActivity?: SubscribedActivityBuilder;
}

export interface WatcherConfig extends Omit<SubscriberConfig, 'buildSubscription'> {
}


// ----------------------------------------------------------------------------
// AddressWatcher Class
// ----------------------------------------------------------------------------

/**
 * Resolves waiting promises whenever a subscriber reports an on-chain change.
 *
 * The watcher is purely reactive — it does not poll on its own. The supplied
 * `BaseSubscriber` is responsible for all polling or push delivery. When the
 * subscriber fires an event, the watcher:
 * - Calls `buildActivity` to derive what it can from the raw event data.
 * - Fetches only the missing types via `fetchFn` (REST/RPC).
 * - Dispatches to any waiting `watch()` promises if the snapshot changed.
 *
 * CCXT Pro streaming pattern:
 * - First `watch()` call → initial snapshot returned immediately via `fetchFn`.
 * - Subsequent calls → block until the next subscriber-driven update.
 */
export class AddressWatcher {
    private lastState = new Map<string, SubscribedAddressSnapshot>();
    private watchedTypes = new Map<string, SubscriptionOption[]>();
    private assetIdResolvers = new Map<string, QueuedPromise<Trade[]>[]>();
    private resolvers = new Map<string, QueuedPromise<SubscribedAddressSnapshot>[]>();

    private readonly fetchFn: FetchFn;
    private readonly subscriber: BaseSubscriber;
    private readonly buildActivity?: SubscribedActivityBuilder;

    constructor(fetchFn: FetchFn, config: AddressWatcherConfig) {
        this.fetchFn = fetchFn;
        this.subscriber = config.subscriber;
        this.buildActivity = config.buildActivity;
    }

    /**
     * Watch an address for activity changes (CCXT Pro pattern).
     *
     * @param address - Public wallet address to watch
     * @param types - Subset of activity to watch
     * @param assetId - Optional asset id to filter activity changes.
     * @returns Promise that resolves with the latest SubscribedAddressSnapshot snapshot
     */
    watch(address: string, types: SubscriptionOption[], assetId: string): Promise<Trade[]>;
    watch(address: string, types: SubscriptionOption[]): Promise<SubscribedAddressSnapshot>;
    async watch(address: string, types: SubscriptionOption[], assetId?: string): Promise<SubscribedAddressSnapshot | Trade[]> {
        const key = address.toLowerCase();

        const currTypes = this.watchedTypes.get(key) ?? [];
        const newTypes = [...new Set([...currTypes, ...types])];

        this.watchedTypes.set(key, newTypes);

        const diff = newTypes.filter(x => !currTypes.includes(x));

        if (diff.length > 0) {
            await this.subscriber.subscribe(address, newTypes, (data) => this.handleSubscriptionData(address, data));
        }

        if (assetId) {
            const assetKey = `${key} ${assetId}`;
            return new Promise<Trade[]>((resolve, reject) => {
                if (!this.assetIdResolvers.has(assetKey)) {
                    this.assetIdResolvers.set(assetKey, []);
                }
                this.assetIdResolvers.get(assetKey)!.push({ resolve, reject });
            });
        }

        return new Promise<SubscribedAddressSnapshot>((resolve, reject) => {
            if (!this.resolvers.has(key)) {
                this.resolvers.set(key, []);
            }
            this.resolvers.get(key)!.push({ resolve, reject });
        });
    }

    /**
     * Stop watching an address, cancel its poll timer, unsubscribe from the
     * subscriber, and reject any pending callers.
     *
     * @param address - Public wallet address to unwatch
     */
    unwatch(address: string): void {
        const key = address.toLowerCase();

        this.subscriber?.unsubscribe(address);

        const resolvers = this.resolvers.get(key);
        if (resolvers) {
            resolvers.forEach(r => r.reject(new Error(`Stopped watching ${address}`)));
            this.resolvers.delete(key);
        }

        this.lastState.delete(key);
        this.watchedTypes.delete(key);

        for (const [k, v] of this.assetIdResolvers.entries()) {
            if (k.startsWith(`${key} `)) {
                v.forEach((r) => r.reject(new Error(`Stopped watching ${address}`)));
                this.assetIdResolvers.delete(k);
            }
        }
    }

    /** Stop all active watchers and close the underlying trigger. */
    close(): void {
        for (const address of [...this.watchedTypes.keys()]) {
            this.unwatch(address);
        }
        this.subscriber?.close();
    }

    /**
     * Handle raw event data from the subscriber.
     *
     * @param address - Public wallet address to watch
     * @param data - Raw event payload from the subscriber
     *
     * Calls `buildActivity` to attempt constructing a partial result from the
     * event payload. Fetches only the types that are missing from the partial,
     * then resolves any waiting promises if a change is detected.
     *
     * Falls back to a full `poll()` when no `buildActivity` is configured or
     * when it returns `null`.
     */
    private async handleSubscriptionData(address: string, data: unknown): Promise<void> {
        const key = address.toLowerCase();
        const types = this.watchedTypes.get(key);
        if (!types) return;

        try {
            const lastActivity = this.lastState.get(key);
            const partial = this.buildActivity
                ? this.buildActivity(data, address, types, lastActivity)
                : null;

            let merged: SubscribedAddressSnapshot;
            if (partial === null) {
                merged = await this.fetchFn(address, types);
            } else {
                const missingTypes = types.filter(t => !(t in partial)) as SubscriptionOption[];
                if (missingTypes.length > 0) {
                    const fetched = await this.fetchFn(address, missingTypes);
                    merged = { ...fetched, ...partial, address, timestamp: Date.now() };
                } else {
                    merged = { address, timestamp: Date.now(), ...partial };
                }
            }

            const last = this.lastState.get(key);
            const value = last ? this.getChanged(last, merged) : merged;
            this.lastState.set(key, merged);
            // Ignore the fist snapshot and only deliver the changed fields
            if (last && this.hasChanges(value)) {
                const resolvers = this.resolvers.get(key);
                if (resolvers?.length) {
                    resolvers.forEach(r => r.resolve(value));
                    this.resolvers.set(key, []);
                }
                this.dispatchAssetResolvers(key, value);
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));

            const resolvers = this.resolvers.get(key);
            if (resolvers?.length) {
                resolvers.forEach(r => r.reject(error));
                this.resolvers.set(key, []);
            }

            for (const [assetKey, assetResolvers] of this.assetIdResolvers) {
                if (assetKey.startsWith(`${key} `) && assetResolvers.length > 0) {
                    assetResolvers.forEach(r => r.reject(error));
                    this.assetIdResolvers.set(assetKey, []);
                }
            }
        }
    }

    private dispatchAssetResolvers(addrKey: string, activity: SubscribedAddressSnapshot): void {
        for (const [assetKey, resolvers] of this.assetIdResolvers) {
            if (!assetKey.startsWith(`${addrKey} `) || !resolvers.length) continue;
            const assetId = assetKey.slice(addrKey.length + 1);
            const matching = (activity.trades ?? []).filter(t => t.outcomeId === assetId);
            if (matching.length > 0) {
                resolvers.forEach(r => r.resolve(matching));
                this.assetIdResolvers.set(assetKey, []);
            }
        }
    }

    private getChanged(prev: SubscribedAddressSnapshot, curr: SubscribedAddressSnapshot): SubscribedAddressSnapshot {
        const changed: SubscribedAddressSnapshot = { address: curr.address, timestamp: curr.timestamp };

        if (curr.trades !== undefined) {
            const prevIds = new Set(prev.trades?.map(t => t.id) ?? []);
            changed.trades = curr.trades.filter(t => !prevIds.has(t.id));
        }

        if (curr.positions !== undefined) {
            const prevSizeByOutcome = new Map(prev.positions?.map(p => [p.outcomeId, p.size]) ?? []);
            changed.positions = curr.positions.filter(p =>
                !prevSizeByOutcome.has(p.outcomeId) || prevSizeByOutcome.get(p.outcomeId) !== p.size,
            );
        }

        if (curr.balances !== undefined) {
            const prevTotalByCurrency = new Map(prev.balances?.map(b => [b.currency, b.total]) ?? []);
            changed.balances = curr.balances.filter(b =>
                !prevTotalByCurrency.has(b.currency) || prevTotalByCurrency.get(b.currency) !== b.total,
            );
        }
        return changed;
    }

    private hasChanges(value: SubscribedAddressSnapshot): boolean {
        if (value.trades !== undefined && value.trades.length > 0) return true;
        if (value.positions !== undefined && value.positions.length > 0) return true;
        return value.balances !== undefined && value.balances.length > 0;
    }
}
