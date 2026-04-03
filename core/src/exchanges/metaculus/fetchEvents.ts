import { EventFetchParams } from "../../BaseExchange";
import { UnifiedEvent } from "../../types";
import { mapMarketToUnified } from "./utils";
import { metaculusErrorMapper } from "./errors";

type CallApi = (
    operationId: string,
    params?: Record<string, any>,
) => Promise<any>;

const BATCH_SIZE = 100;
const MAX_PAGES = 200;

/**
 * Map pmxt status values → Metaculus `statuses` array param.
 */
function toApiStatuses(status?: string): string[] | undefined {
    if (!status || status === "all") return undefined;
    if (status === "closed" || status === "inactive") return ["closed", "resolved"];
    return ["open"];
}

/**
 * Fetch pages of posts with pagination.
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

        all = all.concat(results);
        offset += results.length;
        page++;

        if (targetCount && all.length >= targetCount) break;
        if (!data.next) break;
    } while (page < MAX_PAGES);

    return all;
}

/**
 * Wrap a single Metaculus Post as a UnifiedEvent.
 * On Metaculus, each post IS the event — markets contains just the one post.
 */
function postToEvent(post: any): UnifiedEvent | null {
    const market = mapMarketToUnified(post);
    if (!market) return null;

    const id = String(post.id);
    return {
        id,
        title: post.title ?? "",
        description: post.question?.description ?? post.question?.resolution_criteria ?? "",
        slug: post.slug ?? post.url_title ?? id,
        markets: [market],
        volume24h: 0,
        volume: 0,
        url: `https://www.metaculus.com/questions/${id}/`,
        image: post.projects?.default_project?.header_image ?? undefined,
        category:
            post?.projects?.category?.[0] != null
                ? typeof post.projects.category[0] === "string"
                    ? post.projects.category[0]
                    : post.projects.category[0]?.name
                : undefined,
        tags: market.tags ?? [],
    };
}

/**
 * Fetch a single post by numeric ID and return it as a UnifiedEvent.
 */
async function fetchEventByPostId(
    id: string,
    callApi: CallApi,
): Promise<UnifiedEvent[]> {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return [];

    const data = await callApi("GetPost", { postId: numericId });
    if (!data || !data.id) return [];

    const event = postToEvent(data);
    return event ? [event] : [];
}

/**
 * Look up an event by slug — try numeric ID first, then client-side slug match.
 */
async function fetchEventBySlug(
    slug: string,
    callApi: CallApi,
): Promise<UnifiedEvent[]> {
    // Try as numeric post ID
    const byId = await fetchEventByPostId(slug, callApi);
    if (byId.length > 0) return byId;

    // Try as tournament-slug filter — fetch posts belonging to that tournament
    try {
        const posts = await fetchPostPages(
            callApi,
            { tournaments: [slug], with_cp: true, order_by: "-forecasts_count" },
            100,
        );

        if (posts.length > 0) {
            // Represent the whole tournament as a single event whose markets
            // are the individual posts
            const markets = posts
                .map((p: any) => mapMarketToUnified(p, slug))
                .filter(Boolean) as ReturnType<typeof mapMarketToUnified>[];

            const validMarkets = markets.filter((m): m is NonNullable<typeof m> => m !== null);

            return [
                {
                    id: slug,
                    title: slug,
                    description: "",
                    slug,
                    markets: validMarkets,
                    volume24h: 0,
                    volume: 0,
                    url: `https://www.metaculus.com/tournament/${slug}/`,
                    image: undefined,
                    category: undefined,
                    tags: [],
                },
            ];
        }
    } catch {
        // fall through
    }

    // Finally try slug match against post.slug / post.url_title
    const posts = await fetchPostPages(
        callApi,
        { with_cp: true, order_by: "-forecasts_count" },
        500,
    );
    const lower = slug.toLowerCase();
    for (const p of posts) {
        if (
            (p.slug ?? "").toLowerCase() === lower ||
            (p.url_title ?? "").toLowerCase() === lower
        ) {
            const event = postToEvent(p);
            return event ? [event] : [];
        }
    }

    return [];
}

export async function fetchEvents(
    params: EventFetchParams,
    callApi: CallApi,
): Promise<UnifiedEvent[]> {
    try {
        // Direct lookup by slug (post ID, tournament slug, or url_title)
        if (params.slug) {
            return await fetchEventBySlug(params.slug, callApi);
        }

        // Direct lookup by eventId (post ID or tournament slug)
        if (params.eventId) {
            // Try as numeric post ID first
            const byId = await fetchEventByPostId(params.eventId, callApi);
            if (byId.length > 0) return byId;

            // Try as tournament slug
            return await fetchEventBySlug(params.eventId, callApi);
        }

        // Default listing — wrap posts as standalone events
        const limit = params?.limit ?? 50;
        const offset = params?.offset ?? 0;
        const query = (params?.query ?? "").toLowerCase();
        const statuses = toApiStatuses(params?.status);

        const apiParams: Record<string, any> = {
            with_cp: true,
        };
        if (statuses) apiParams.statuses = statuses;

        // Sort mapping
        if (params?.sort === "newest") {
            apiParams.order_by = "-published_at";
        } else {
            apiParams.order_by = "-forecasts_count";
        }

        const posts = await fetchPostPages(callApi, apiParams, (offset + limit) * (query ? 5 : 1));

        // Client-side keyword filter
        const filtered = query
            ? posts.filter((p: any) =>
                (p.title ?? "").toLowerCase().includes(query) ||
                (p.question?.description ?? "").toLowerCase().includes(query),
            )
            : posts;

        const events: UnifiedEvent[] = [];
        for (const p of filtered.slice(offset, offset + limit)) {
            const e = postToEvent(p);
            if (e) events.push(e);
        }

        return events;
    } catch (error: any) {
        throw metaculusErrorMapper.mapError(error);
    }
}
