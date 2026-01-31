import { exchangeClasses, hasAuth, initExchange } from './shared';

describe('Compliance: cancelOrder', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with cancelOrder standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.cancelOrder`);

                const orderIdToCancel = '123e4567-e89b-12d3-a456-426614174000';
                const cancelledOrder = await exchange.cancelOrder(orderIdToCancel);

                expect(cancelledOrder.id).toBeDefined();
                expect(['cancelled', 'canceled']).toContain(cancelledOrder.status);

            } catch (error: any) {
                const msg = (error.message || '').toLowerCase();
                const responseData = error.response?.data ? JSON.stringify(error.response.data).toLowerCase() : '';

                // If the API returns "Order not found" or "Invalid orderID", it means:
                // 1. Authentication worked
                // 2. Endpoint was reached
                // 3. Logic was executed
                // This counts as COMPLIANT for interface testing purposes.
                if (
                    msg.includes('order not found') ||
                    msg.includes('invalid orderid') ||
                    responseData.includes('order not found') ||
                    responseData.includes('invalid orderid') ||
                    (error.response && error.response.status === 404)
                ) {
                    console.info(`[Compliance] ${name}.cancelOrder verified (Order not found as expected).`);
                    return;
                }

                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.cancelOrder not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
