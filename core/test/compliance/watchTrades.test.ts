import { exchangeClasses, validateTrade, hasAuth, initExchange } from './shared';

describe('Compliance: watchTrades', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        test(`${name} should comply with watchTrades standards`, async () => {
            if (name === 'LimitlessExchange') {
                console.info(`[Compliance] ${name}.watchTrades skipped (no websocket support)`);
                return;
            }

            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.watchTrades`);

                const markets = await exchange.fetchMarkets({ limit: 25, sort: 'volume' });
                if (!markets || markets.length === 0) {
                    throw new Error(`${name}: No markets found to test watchTrades`);
                }

                let tradeReceived: any;
                let testedOutcomeId = '';
                let marketFound = false;

                // Optimization: Watch multiple outcomes in parallel.
                const CONCURRENT_WATCHERS = 50;

                // Discovery Phase: Find markets that actually have recent trades
                let candidates = markets.slice(0, 50);

                if (name === 'KalshiExchange') {
                    // Strategy: Look for "Daily" or "15m" crypto markers, and date-specific markets.
                    // These often have low 24h volume but high instantaneous activity.
                    console.info(`[Compliance] Finding high-liquidity markets for ${name}...`);

                    const now = new Date();
                    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                    const month = monthNames[now.getMonth()];
                    const shortMonth = month.substring(0, 3);
                    const day = now.getDate();

                    // Search terms: Crypto + Date-based
                    const searchTerms = ['BTC', 'ETH', 'SOL', 'CRYPTO', `${shortMonth} ${day}`, month];

                    // Optimization: We already have 1000 markets in 'markets'.
                    // Let's use them first, but also do the parallel searches for fresh data if needed.
                    // Actually, fetchMarkets({ query }) fetches 5000, so it's better.

                    const searchResults = await Promise.all(
                        searchTerms.map(term =>
                            (exchange as any).fetchMarkets({ query: term, searchIn: 'both', limit: 25 })
                                .catch(() => [])
                        )
                    );

                    const allSearchHits = searchResults.flat();
                    console.info(`[Compliance] ${name}: Found ${allSearchHits.length} potential market hits from search.`);

                    const highFreq = allSearchHits.filter((m: any) => {
                        const id = (m.marketId || '').toUpperCase();
                        const title = (m.title || '').toUpperCase();
                        const isCrypto = id.includes('15M') || id.includes('DAILY') || title.includes('15 MINUTE') || title.includes('DAILY') || title.includes('CRYPTO');
                        const isDateMatch = title.includes(month.toUpperCase()) || title.includes(shortMonth.toUpperCase());
                        return isCrypto || isDateMatch;
                    });

                    if (highFreq.length > 0) {
                        console.info(`[Compliance] Found ${highFreq.length} high-frequency/date-matched Kalshi markets. Prioritizing.`);
                        candidates = [...highFreq, ...candidates];
                    } else if (allSearchHits.length > 0) {
                        // Fallback: any hit from search
                        candidates = [...allSearchHits.slice(0, 30), ...candidates];
                    }

                    // Deduplicate
                    const seen = new Set();
                    candidates = candidates.filter((m: any) => {
                        if (seen.has(m.marketId)) return false;
                        seen.add(m.marketId);
                        return true;
                    });
                }

                // Cap candidates for the deep REST scan (rate limits)
                // For Kalshi we increase this to find high-activity markets among the crypto/date searches.
                const scanLimit = (name === 'KalshiExchange') ? 50 : 20;
                candidates = candidates.slice(0, scanLimit);

                interface ScoredMarket {
                    market: any;
                    lastTradeTs: number;
                }

                console.info(`[Compliance] Scanning top ${candidates.length} markets for recent activity...`);

                // Helper for throttled execution
                const chunkedChecks = async () => {
                    const results = [];
                    const CHUNK_SIZE = 5;
                    for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
                        const chunk = candidates.slice(i, i + CHUNK_SIZE);
                        const chunkResults = await Promise.all(chunk.map(async (m: any) => {
                            try {
                                const trades = await exchange.fetchTrades(m.marketId, { limit: 1 });
                                if (trades.length > 0 && !isNaN(trades[0].timestamp)) {
                                    return { market: m, lastTradeTs: trades[0].timestamp };
                                }
                            } catch (e) {
                                // ignore errors during scan
                            }
                            return null;
                        }));
                        results.push(...chunkResults);
                        // Small delay between chunks
                        if (i + CHUNK_SIZE < candidates.length) await new Promise(r => setTimeout(r, 500));
                    }
                    return results;
                };

                const results = await chunkedChecks();

                const activeMarketsList = results
                    .filter((r): r is ScoredMarket => r !== null)
                    .sort((a, b) => b.lastTradeTs - a.lastTradeTs) // Newest first
                    .map(r => r.market)
                    .slice(0, CONCURRENT_WATCHERS);

                // Fallback to volume-based if no recent trades found
                const marketsToUse = activeMarketsList.length > 0 ? activeMarketsList : candidates.slice(0, CONCURRENT_WATCHERS);

                const newestDateStr = (activeMarketsList.length > 0 && !isNaN(activeMarketsList[0].lastTradeTs))
                    ? new Date(activeMarketsList[0].lastTradeTs).toISOString()
                    : 'N/A';

                console.info(`[Compliance] Selected ${marketsToUse.length} markets. Most recent trade in set: ${newestDateStr}`);

                const outcomesToWatch = marketsToUse
                    .map((m: any) => m.outcomes[0]) // Pick first outcome of each market
                    .filter((o: any) => o !== undefined);

                if (outcomesToWatch.length === 0) {
                    throw new Error(`${name}: No outcomes found to test watchTrades`);
                }

                console.info(`[Compliance] Watching ${outcomesToWatch.length} outcomes concurrently for activity...`);

                const watchers = outcomesToWatch.map(async (outcome: any) => {
                    try {
                        const result = await exchange.watchTrades(outcome.outcomeId);
                        return { result, outcomeId: outcome.outcomeId };
                    } catch (error: any) {
                        // Check for critical errors that should abort the test immediately (like missing auth)
                        const msg = error.message.toLowerCase();
                        if (msg.includes('not supported') || msg.includes('authentication') || msg.includes('credentials') || msg.includes('api key')) {
                            throw error;
                        }
                        // For generic timeouts or socket errors, we just rethrow.
                        // Promise.any will wait for other outcomes to succeed.
                        throw error;
                    }
                });

                let timeoutId: NodeJS.Timeout;
                const globalTimeout = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('Test timeout: No trades detected on any top market within 90s')), 90000);
                });

                try {
                    // Start the race: wait for ANY outcome to yield a trade OR the global timeout
                    const winner = await Promise.race([
                        Promise.any(watchers),
                        globalTimeout
                    ]) as { result: any, outcomeId: string };

                    tradeReceived = winner.result;
                    testedOutcomeId = winner.outcomeId;
                    marketFound = true;
                } catch (error: any) {
                    // If it's an AggregateError from Promise.any, it means ALL watchers failed.
                    // We might want to see the individual errors for debugging.
                    if (error.name === 'AggregateError') {
                        throw new Error(`${name}: All ${watchers.length} watchers failed. First error: ${error.errors[0]?.message || 'Unknown error'}`);
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId!);
                }

                expect(tradeReceived).toBeDefined();
                if (Array.isArray(tradeReceived)) {
                    expect(tradeReceived.length).toBeGreaterThan(0);
                    for (const trade of tradeReceived) {
                        validateTrade(trade, name, testedOutcomeId);
                    }
                } else {
                    validateTrade(tradeReceived, name, testedOutcomeId);
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not supported') || msg.includes('not implemented') || msg.includes('unavailable') || msg.includes('authentication') || msg.includes('credentials') || msg.includes('api key')) {
                    console.info(`[Compliance] ${name}.watchTrades skipped/unsupported: ${error.message}`);
                    return;
                }
                throw error;
            } finally {
                await exchange.close();
            }
        }, 120000);
    });
});
