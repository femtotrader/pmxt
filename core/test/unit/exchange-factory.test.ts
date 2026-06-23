import { createExchange } from '../../src/server/exchange-factory';
import { KalshiDemoExchange } from '../../src/exchanges/kalshi-demo';

const withEnv = <T>(env: NodeJS.ProcessEnv, run: () => T): T => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, ...env };
    try {
        return run();
    } finally {
        process.env = originalEnv;
    }
};

describe('createExchange', () => {
    test('kalshi-demo prefers demo credentials before production fallbacks', () => {
        withEnv(
            {
                KALSHI_API_KEY: 'prod-key',
                KALSHI_PRIVATE_KEY: 'prod-private-key',
                KALSHI_DEMO_API_KEY: 'demo-key',
                KALSHI_DEMO_PRIVATE_KEY: 'demo-private-key',
            },
            () => {
                const exchange = createExchange('kalshi-demo');

                expect(exchange).toBeInstanceOf(KalshiDemoExchange);
                expect((exchange as any).auth?.credentials).toMatchObject({
                    apiKey: 'demo-key',
                    privateKey: 'demo-private-key',
                });
            },
        );
    });
});
