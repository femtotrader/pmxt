import { MarketFetchParams } from "../../BaseExchange";
import { UnifiedMarket } from "../../types";
import { expandPost } from "./utils";
import { metaculusErrorMapper } from "./errors";

type CallApi = (
    operationId: string,
    params?: Record<string, any>,
) => Promise<any>;

const BATCH_SIZE = 100;   // max per page
const MAX_PAGES = 200;    // safety cap (~20 000 posts)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Module-level cache for the default active-posts listing
let cachedPosts: any[] | null = null;
let lastCacheTime = 0;

export function resetCache(): void {
    cachedPosts = null;
    lastCacheTime = 0;
}

/**
 * Map pmxt status values to Metaculus `statuses` array param.
 */
function toApiStatuses(status?: string): string[] | undefined {
    if (!status || status === "all") return undefined;
    if (status === "closed" || status === "inactive") return ["closed", "resolved"];
    return ["open"]; // "active" or anything else -> open
}

/**
 * Fetch pages of posts from /api/posts/ using offset-based pagination.
 *
 * Note: group-of-questions posts expand into multiple markets, so the
 * actual number of markets may exceed the number of raw posts fetched.
 * The targetCount is a rough guide, not exact.
 */
async function fetchPostPages(
    callApi: CallApi,
    apiParams: Record<string, any>,
    targetCount?: number,
): Promise<any[]> {
    let all: any[] = [];
    let offset = 0;
    let page = 0;

    do {
        const data = await callApi("GetPosts", {
            ...apiParams,
            limit: BATCH_SIZE,
            offset,
        });

        const results: any[] = data.results ?? [];
        if (results.length === 0) break;

        all.push(...results);
        offset += results.length;
        page++;

        // Early-exit when we have enough results (with buffer for filtering)
        if (targetCount && all.length >= targetCount * 1.5) break;

        if (!data.next) break;
    } while (page < MAX_PAGES);

    return all;
}

/**
 * Expand a list of raw posts into UnifiedMarket[], handling both
 * single-question and group-of-questions posts.
 */
function expandPosts(posts: any[], eventId?: string): UnifiedMarket[] {
    const markets: UnifiedMarket[] = [];
    for (const p of posts) {
        markets.push(...expandPost(p, eventId));
    }
    return markets;
}

/**
 * Fetch a single post by numeric ID and expand it.
 * A group post will return multiple markets (one per sub-question).
 */
async function fetchMarketById(
    id: string,
    callApi: CallApi,
): Promise<UnifiedMarket[]> {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return [];

    const data = await callApi("GetPost", { postId: numericId });
    if (!data || !data.id) return [];

    return expandPost(data);
}

/**
 * Search posts by keyword -- the Metaculus /api/posts/ has no server-side
 * `search` param, so we fetch a batch of recent open posts and filter
 * client-side by title/description match.
 */
async function searchMarkets(
    query: string,
    params: MarketFetchParams | undefined,
    callApi: CallApi,
): Promise<UnifiedMarket[]> {
    const limit = params?.limit ?? 200;
    const statuses = toApiStatuses(params?.status);

    const apiParams: Record<string, any> = {
        order_by: "-forecasts_count",
        with_cp: true,
    };
    if (statuses) apiParams.statuses = statuses;

    // Fetch enough posts to give the client-side filter something to work with
    const posts = await fetchPostPages(callApi, apiParams, Math.max(limit * 5, 500));

    const lower = query.toLowerCase();
    const markets: UnifiedMarket[] = [];
    for (const p of posts) {
        const title = (p.title ?? "").toLowerCase();
        const desc = (p.question?.description ?? "").toLowerCase();
        if (title.includes(lower) || desc.includes(lower)) {
            markets.push(...expandPost(p));
        }
        if (markets.length >= limit) break;
    }

    return markets.slice(0, limit);
}

async function fetchMarketsDefault(
    params: MarketFetchParams | undefined,
    callApi: CallApi,
): Promise<UnifiedMarket[]> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;
    const now = Date.now();

    const statuses = toApiStatuses(params?.status ?? "active");
    const useCache = (!params?.status || params.status === "active") && !params?.sort;

    let posts: any[];

    if (useCache && cachedPosts && now - lastCacheTime < CACHE_TTL) {
        posts = cachedPosts;
    } else {
        const apiParams: Record<string, any> = {
            with_cp: true,
        };
        if (statuses) apiParams.statuses = statuses;

        // Map sort to the new order_by enum values
        if (params?.sort === "newest") {
            apiParams.order_by = "-published_at";
        } else {
            apiParams.order_by = "-forecasts_count";
        }

        const fetchLimit =
            params?.sort === "volume" || params?.sort === "liquidity"
                ? 2000
                : limit + offset;

        posts = await fetchPostPages(callApi, apiParams, fetchLimit);

        if (useCache && posts.length >= 100) {
            cachedPosts = posts;
            lastCacheTime = now;
        }
    }

    const markets = expandPosts(posts);

    if (params?.sort === "liquidity") {
        markets.sort((a, b) => b.liquidity - a.liquidity);
    }

    return markets.slice(offset, offset + limit);
}

export async function fetchMarkets(
    params: MarketFetchParams | undefined,
    callApi: CallApi,
): Promise<UnifiedMarket[]> {
    try {
        // Direct lookup by numeric post/question ID
        if (params?.marketId) {
            return await fetchMarketById(params.marketId, callApi);
        }

        // outcomeId pattern: "<questionId>-YES" / "<questionId>-NO" / "<questionId>-<idx>"
        if (params?.outcomeId) {
            const id = params.outcomeId.split("-")[0];
            return await fetchMarketById(id, callApi);
        }

        // slug: try as numeric ID first (Metaculus slugs are typically words,
        // but callers may pass the numeric post ID as a slug)
        if (params?.slug) {
            const byId = await fetchMarketById(params.slug, callApi);
            if (byId.length > 0) return byId;

            // Fall back to slug-string match against post.slug / post.url_title
            const posts = await fetchPostPages(
                callApi,
                { with_cp: true, order_by: "-forecasts_count" },
                500,
            );
            const lower = params.slug.toLowerCase();
            for (const p of posts) {
                if (
                    (p.slug ?? "").toLowerCase() === lower ||
                    (p.url_title ?? "").toLowerCase() === lower
                ) {
                    return expandPost(p);
                }
            }
            return [];
        }

        // eventId is a tournament slug -- filter posts by that tournament
        if (params?.eventId) {
            const apiParams: Record<string, any> = {
                tournaments: [params.eventId],
                with_cp: true,
                order_by: "-forecasts_count",
            };

            const posts = await fetchPostPages(
                callApi,
                apiParams,
                params?.limit ?? 1000,
            );

            const markets = expandPosts(posts);
            return markets.slice(0, params?.limit ?? markets.length);
        }

        // Keyword search -- client-side filter (no server-side search param)
        if (params?.query) {
            return await searchMarkets(params.query, params, callApi);
        }

        // Default: recent active posts ordered by forecast count
        return await fetchMarketsDefault(params, callApi);
    } catch (error: any) {
        throw metaculusErrorMapper.mapError(error);
    }
}
