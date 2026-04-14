import { exchangeClasses, validateTrade, hasAuth, initExchange, isSkippableError } from './shared';

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

                // Fetch top markets by volume
                const markets = await exchange.fetchMarkets({ limit: 25, sort: 'volume' });
                if (!markets || markets.length === 0) {
                    throw new Error(`${name}: No markets found to test watchTrades`);
                }

                // Watch the top 10 outcomes concurrently, first trade wins
                const outcomesToWatch = markets
                    .slice(0, 10)
                    .map((m: any) => m.outcomes[0])
                    .filter((o: any) => o !== undefined);

                if (outcomesToWatch.length === 0) {
                    throw new Error(`${name}: No outcomes found to test watchTrades`);
                }

                console.info(`[Compliance] Watching ${outcomesToWatch.length} outcomes for activity...`);

                const watchers = outcomesToWatch.map(async (outcome: any) => {
                    const result = await exchange.watchTrades(outcome.outcomeId);
                    return { result, outcomeId: outcome.outcomeId };
                });

                let timeoutId: NodeJS.Timeout;
                const globalTimeout = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`${name}: No trades detected within 30s`)), 30000);
                });

                try {
                    const winner = await Promise.race([
                        Promise.any(watchers),
                        globalTimeout
                    ]) as { result: any, outcomeId: string };

                    const tradeReceived = winner.result;
                    const testedOutcomeId = winner.outcomeId;

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
                    if (error.name === 'AggregateError') {
                        throw new Error(`${name}: All ${watchers.length} watchers failed. First error: ${error.errors[0]?.message || 'Unknown error'}`);
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId!);
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (isSkippableError(error) || msg.includes('unavailable')) {
                    console.info(`[Compliance] ${name}.watchTrades skipped/unsupported: ${error.message}`);
                    return;
                }
                throw error;
            } finally {
                await exchange.close();
            }
        }, 60000);
    });
});
