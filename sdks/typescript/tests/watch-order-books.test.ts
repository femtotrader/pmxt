/**
 * Tests for watchOrderBooks batch method and WS client infrastructure.
 */

import { SidecarWsClient } from "../pmxt/ws-client.js";

describe("SidecarWsClient", () => {
    test("can be instantiated", () => {
        const client = new SidecarWsClient("http://localhost:3847");
        expect(client).toBeDefined();
        expect(client.connected).toBe(false);
    });

    test("close does not throw on unconnected client", () => {
        const client = new SidecarWsClient("http://localhost:3847", "test-token");
        expect(() => client.close()).not.toThrow();
    });

    test("connected returns false after close", () => {
        const client = new SidecarWsClient("http://localhost:3847");
        client.close();
        expect(client.connected).toBe(false);
    });

    test("accepts access token parameter", () => {
        const client = new SidecarWsClient("http://localhost:3847", "my-token");
        // Client stores token for URL construction -- no public getter,
        // but it should instantiate without error.
        expect(client).toBeDefined();
    });
});
