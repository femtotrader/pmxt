import { exchangeClasses, validateOrder, hasAuth, initExchange, isSkippableError } from './shared';

describe('Compliance: fetchClosedOrders', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchClosedOrders standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.fetchClosedOrders`);

                const orders = await exchange.fetchClosedOrders({ limit: 25 });

                expect(Array.isArray(orders)).toBe(true);

                for (const order of orders) {
                    validateOrder(order, name);
                }

            } catch (error: any) {
                if (isSkippableError(error)) {
                    console.info(`[Compliance] ${name}.fetchClosedOrders skipped: ${error.message}`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
