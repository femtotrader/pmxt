/**
 * Curated mapping from normalized PMXT series ids to per-venue native series ids.
 *
 * The normalized ids use kebab-case following the pattern:
 *   <sport-or-domain>-<category-or-format>
 *
 * Venue-native ids are the raw tickers/slugs each platform uses.
 * It is intentional for some entries to have only partial venue coverage --
 * the Router handles missing venue mappings gracefully by skipping that venue.
 */

export interface RouterSeriesEntry {
    /** Normalized PMXT series id (kebab-case). */
    id: string;
    /** Human-readable title. */
    title: string;
    /** Map of venueName -> venue-native series id. */
    venues: { readonly [venueName: string]: string };
}

export const SERIES_MAP: readonly RouterSeriesEntry[] = [
    {
        id: 'tennis-atp-match',
        title: 'ATP Match Winner',
        venues: {
            kalshi: 'KXATPSETWINNER',
            polymarket: 'atp',
        },
    },
    {
        id: 'tennis-atp-challenger',
        title: 'ATP Challenger Match Winner',
        venues: {
            kalshi: 'KXATPCHALLENGERMATCH',
        },
    },
    {
        id: 'tennis-wta-match',
        title: 'WTA Match Winner',
        venues: {
            kalshi: 'KXWTASETWINNER',
            polymarket: 'wta',
        },
    },
    {
        id: 'tennis-itf-match',
        title: 'ITF Match Winner',
        venues: {
            kalshi: 'KXITFMATCH',
        },
    },
    {
        id: 'tennis-itf-women-match',
        title: "ITF Women's Match Winner",
        venues: {
            kalshi: 'KXITFWMATCH',
        },
    },
    {
        id: 'nfl',
        title: 'NFL Game Winner',
        venues: {
            kalshi: 'KXNFLGAME',
            polymarket: 'nfl-game',
        },
    },
    {
        id: 'nba',
        title: 'NBA Game Winner',
        venues: {
            kalshi: 'KXNBAGAME',
            polymarket: 'nba',
        },
    },
    {
        id: 'ncaa-basketball',
        title: 'NCAA Basketball Game Winner',
        venues: {
            kalshi: 'KXNCAABBGAME',
        },
    },
    {
        id: 'ufc',
        title: 'UFC Fight Winner',
        venues: {
            polymarket: 'ufc',
        },
    },
    {
        id: 'soccer-fifa-world-cup',
        title: 'FIFA World Cup Match Winner',
        venues: {
            polymarket: 'soccer-fifwc',
        },
    },
    {
        id: 'esports-cs2-map',
        title: 'CS2 Map Winner',
        venues: {
            kalshi: 'KXCS2MAP',
        },
    },
    {
        id: 'esports-lol-map',
        title: 'League of Legends Map Winner',
        venues: {
            kalshi: 'KXLOLMAP',
        },
    },
    {
        id: 'crypto-btc-15m',
        title: 'Bitcoin Price (15-minute)',
        venues: {
            kalshi: 'KXBTC15M',
        },
    },
    {
        id: 'crypto-eth-15m',
        title: 'Ethereum Price (15-minute)',
        venues: {
            kalshi: 'KXETH15M',
        },
    },
    {
        id: 'crypto-sol-15m',
        title: 'Solana Price (15-minute)',
        venues: {
            kalshi: 'KXSOL15M',
        },
    },
];

// ---------------------------------------------------------------------------
// Lookup helpers (O(n) over small constant array; acceptable for this table)
// ---------------------------------------------------------------------------

/**
 * Resolve a normalized PMXT series id to the venue-native series id for a
 * given venue. Returns `undefined` when either the normalized id is not in the
 * map or that venue has no mapping for it.
 */
export function getVenueSeriesId(normalizedId: string, venue: string): string | undefined {
    const entry = SERIES_MAP.find((e) => e.id === normalizedId);
    return entry?.venues[venue];
}

/**
 * Reverse-lookup: given a venue name and a venue-native series id, return the
 * normalized PMXT series id. Returns `undefined` when not found.
 */
export function getNormalizedSeriesId(venue: string, venueSeriesId: string): string | undefined {
    const entry = SERIES_MAP.find((e) => e.venues[venue] === venueSeriesId);
    return entry?.id;
}
