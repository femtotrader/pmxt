import { ApiDescriptor, ApiEndpoint } from '../BaseExchange';

/**
 * Converts a path segment like "orderbook" or "market-trades" to PascalCase.
 * e.g. "orderbook" -> "Orderbook", "market-trades" -> "MarketTrades"
 */
function toPascalCase(segment: string): string {
    return segment
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

/**
 * Generates a method name from an HTTP method and path.
 * e.g. GET /markets/{ticker}/orderbook -> getMarketsOrderbook
 */
function generateMethodName(httpMethod: string, path: string): string {
    const segments = path
        .split('/')
        .filter(s => s && !s.startsWith('{'));

    const pascalPath = segments.map(toPascalCase).join('');
    return httpMethod.toLowerCase() + pascalPath;
}

/**
 * Parses an OpenAPI 3.x-shaped spec object into a simplified ApiDescriptor.
 *
 * @param spec - An OpenAPI-like spec object with `paths` and optionally `servers`
 * @param baseUrl - The base URL for the API. If omitted, extracted from spec.servers[0].url
 * @returns A simplified ApiDescriptor with method names mapped to endpoints
 */
export function parseOpenApiSpec(spec: any, baseUrl?: string): ApiDescriptor {
    const resolvedBaseUrl = baseUrl
        || (spec.servers && spec.servers[0] && spec.servers[0].url)
        || '';

    const endpoints: Record<string, ApiEndpoint> = {};

    // Inherit top-level security when operations don't define their own
    const topLevelSecurity = !!(spec.security && spec.security.length > 0);

    const paths = spec.paths || {};
    for (const [path, pathItem] of Object.entries<any>(paths)) {
        if (!pathItem || typeof pathItem !== 'object') {
            continue;
        }
        const pathServerUrl = Array.isArray(pathItem.servers) && pathItem.servers[0]?.url
            ? String(pathItem.servers[0].url).replace(/\/$/, '')
            : undefined;

        for (const [httpMethod, operation] of Object.entries<any>(pathItem)) {
            // Skip non-HTTP-method keys like "parameters", "servers"
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(httpMethod.toLowerCase())) {
                continue;
            }
            if (!operation || typeof operation !== 'object') {
                continue;
            }

            const opServerUrl = Array.isArray(operation.servers) && operation.servers[0]?.url
                ? String(operation.servers[0].url).replace(/\/$/, '')
                : undefined;
            const endpointBaseUrl = opServerUrl || pathServerUrl;

            const name = operation.operationId || generateMethodName(httpMethod, path);
            const isPrivate = operation.security !== undefined
                ? !!(operation.security && operation.security.length > 0)
                : topLevelSecurity;

            endpoints[name] = {
                method: httpMethod.toUpperCase(),
                path,
                isPrivate,
                operationId: operation.operationId,
                ...(endpointBaseUrl ? { baseUrl: endpointBaseUrl } : {}),
            };
        }
    }

    return { baseUrl: resolvedBaseUrl, endpoints };
}
