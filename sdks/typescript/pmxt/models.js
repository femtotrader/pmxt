"use strict";
/**
 * Data models for PMXT TypeScript SDK.
 *
 * These are clean TypeScript interfaces that provide a user-friendly API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketList = void 0;
/**
 * A list of UnifiedMarket objects with a convenience match() method.
 * Extends Array so all standard array operations work unchanged.
 */
class MarketList extends Array {
    /**
     * Find a single market by case-insensitive substring match.
     *
     * @param query - Substring to search for
     * @param searchIn - Fields to search in (default: ['title'])
     * @returns The matching UnifiedMarket
     * @throws Error if zero or multiple markets match
     */
    match(query, searchIn) {
        const fields = searchIn || ['title'];
        const lowerQuery = query.toLowerCase();
        const matches = [];
        for (const m of this) {
            for (const field of fields) {
                if (field === 'title' && m.title?.toLowerCase().includes(lowerQuery)) {
                    matches.push(m);
                    break;
                }
                if (field === 'description' && m.description?.toLowerCase().includes(lowerQuery)) {
                    matches.push(m);
                    break;
                }
                if (field === 'category' && m.category?.toLowerCase().includes(lowerQuery)) {
                    matches.push(m);
                    break;
                }
                if (field === 'tags' && m.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
                    matches.push(m);
                    break;
                }
                if (field === 'outcomes' && m.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                    matches.push(m);
                    break;
                }
            }
        }
        if (matches.length === 0) {
            throw new Error(`No markets matching '${query}'`);
        }
        if (matches.length > 1) {
            const titles = matches.map(m => m.title);
            throw new Error(`Multiple markets matching '${query}': ${JSON.stringify(titles)}`);
        }
        return matches[0];
    }
}
exports.MarketList = MarketList;
