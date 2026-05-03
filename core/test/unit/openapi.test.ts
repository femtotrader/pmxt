import { polymarketClobSpec } from '../../src/exchanges/polymarket/api-clob';
import { parseOpenApiSpec } from '../../src/utils/openapi';

describe('parseOpenApiSpec', () => {
    it('Polymarket getGeoblock uses website API host (not CLOB)', () => {
        const d = parseOpenApiSpec(polymarketClobSpec);
        expect(d.endpoints.getGeoblock.baseUrl).toBe('https://polymarket.com/api');
        expect(d.endpoints.getGeoblock.path).toBe('/geoblock');
    });

    it('uses operation-level servers as endpoint baseUrl override', () => {
        const spec = {
            openapi: '3.0.3',
            servers: [{ url: 'https://primary.example.com' }],
            paths: {
                '/x': {
                    get: {
                        operationId: 'getX',
                        servers: [{ url: 'https://override.example.com/' }],
                    },
                },
            },
        };

        const d = parseOpenApiSpec(spec);
        expect(d.baseUrl).toBe('https://primary.example.com');
        expect(d.endpoints.getX.baseUrl).toBe('https://override.example.com');
    });

    it('inherits path-level servers when the operation omits servers', () => {
        const spec = {
            openapi: '3.0.3',
            servers: [{ url: 'https://primary.example.com' }],
            paths: {
                '/y': {
                    servers: [{ url: 'https://path-level.example.com' }],
                    get: { operationId: 'getY' },
                },
            },
        };

        const d = parseOpenApiSpec(spec);
        expect(d.endpoints.getY.baseUrl).toBe('https://path-level.example.com');
    });
});
