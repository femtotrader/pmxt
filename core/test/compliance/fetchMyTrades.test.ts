import { exchangeClasses, validateUserTrade, hasAuth, initExchange, isSkippableError } from './shared';
import { AuthenticationError } from '../../src/errors';

describe('Compliance: fetchMyTrades', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchMyTrades standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.fetchMyTrades`);

                const trades = await exchange.fetchMyTrades({ limit: 25 });

                expect(Array.isArray(trades)).toBe(true);

                for (const trade of trades) {
                    validateUserTrade(trade, name);
                }

            } catch (error: any) {
                const msg = error.message?.toLowerCase() ?? '';
                if (isSkippableError(error)) {
                    console.info(`[Compliance] ${name}.fetchMyTrades skipped: ${error.message}`);
                    return;
                }
                if (error instanceof AuthenticationError || msg.includes('authentication') || msg.includes('wallet address')) {
                    console.info(`[Compliance] ${name}.fetchMyTrades requires additional credentials (wallet address or API auth).`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
