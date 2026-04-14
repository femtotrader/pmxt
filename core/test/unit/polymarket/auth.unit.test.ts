import { PolymarketAuth } from '../../../src/exchanges/polymarket/auth';

/**
 * Regression coverage for the silent zero-balance bug.
 *
 * When a user provides funderAddress (a Gnosis Safe / Polymarket Proxy) but
 * does NOT provide signatureType, getClobClient previously skipped discovery
 * entirely and defaulted signatureType to 0 (EOA). The CLOB API silently
 * returned balance "0" for that mismatched (proxy, EOA) pair instead of an
 * error, so users saw a zero balance even when their wallet had funds.
 */
describe('PolymarketAuth: signature type inference', () => {
    const signerKey = '0x0000000000000000000000000000000000000000000000000000000000000001';

    function makeAuth(credentials: any): any {
        const auth: any = new PolymarketAuth(credentials);
        // Stub L1 credential acquisition so we don't hit the network.
        auth.getApiCredentials = jest.fn().mockResolvedValue({
            key: 'k', secret: 'cw==', passphrase: 'p',
        });
        return auth;
    }

    it('defaults to gnosissafe (2) when funderAddress differs from signer and discovery fails', async () => {
        const auth = makeAuth({
            privateKey: signerKey,
            funderAddress: '0x960CC47cfE7e78b3a927c1Ce0dC1be7034A1623a',
        });
        // Simulate data-api unreachable: discoverProxy returns the synthetic
        // EOA fallback with signatureType=0.
        auth.discoverProxy = jest.fn().mockResolvedValue({
            proxyAddress: auth.signer.address,
            signatureType: 0,
        });

        const client = await auth.getClobClient();

        expect(client.orderBuilder.signatureType).toBe(2);
    });

    it('uses discovered signatureType when discovery succeeds', async () => {
        const auth = makeAuth({ privateKey: signerKey });
        auth.discoveredProxyAddress = '0xabc0000000000000000000000000000000000001';
        auth.discoveredSignatureType = 2;
        auth.discoverProxy = jest.fn().mockResolvedValue({
            proxyAddress: auth.discoveredProxyAddress,
            signatureType: auth.discoveredSignatureType,
        });

        const client = await auth.getClobClient();

        expect(client.orderBuilder.signatureType).toBe(2);
    });

    it('respects an explicit signatureType from credentials', async () => {
        const auth = makeAuth({
            privateKey: signerKey,
            funderAddress: '0x960CC47cfE7e78b3a927c1Ce0dC1be7034A1623a',
            signatureType: 'polyproxy',
        });
        auth.discoverProxy = jest.fn();

        const client = await auth.getClobClient();

        expect(client.orderBuilder.signatureType).toBe(1);
        expect(auth.discoverProxy).not.toHaveBeenCalled();
    });

    it('defaults to gnosissafe (2) when no funder is provided and discovery falls back to EOA', async () => {
        const auth = makeAuth({ privateKey: signerKey });
        // No discovered fields cached → discoverySucceeded=false
        // Discovery returns EOA-like result but without setting instance
        // properties, so the code correctly falls through to the Gnosis Safe
        // default (the modern Polymarket standard since 2023).
        auth.discoverProxy = jest.fn().mockResolvedValue({
            proxyAddress: auth.signer.address,
            signatureType: 0,
        });

        const client = await auth.getClobClient();

        expect(client.orderBuilder.signatureType).toBe(2);
    });
});
