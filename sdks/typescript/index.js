"use strict";
/**
 * PMXT - Unified Prediction Market API (TypeScript SDK)
 *
 * A unified interface for interacting with multiple prediction market exchanges
 * (Kalshi, Polymarket) identically.
 *
 * @example
 * ```typescript
 * import { Polymarket, Kalshi } from "pmxtjs";
 *
 * // Initialize exchanges
 * const poly = new Polymarket();
 * const kalshi = new Kalshi();
 *
 * // Fetch markets
 * const markets = await poly.fetchMarkets({ query: "Trump" });
 * console.log(markets[0].title);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketList = exports.ServerManager = exports.Limitless = exports.Kalshi = exports.Polymarket = exports.Exchange = void 0;
const client_js_1 = require("./pmxt/client.js");
const server_manager_js_1 = require("./pmxt/server-manager.js");
const models = require("./pmxt/models.js");
var client_js_2 = require("./pmxt/client.js");
Object.defineProperty(exports, "Exchange", { enumerable: true, get: function () { return client_js_2.Exchange; } });
Object.defineProperty(exports, "Polymarket", { enumerable: true, get: function () { return client_js_2.Polymarket; } });
Object.defineProperty(exports, "Kalshi", { enumerable: true, get: function () { return client_js_2.Kalshi; } });
Object.defineProperty(exports, "Limitless", { enumerable: true, get: function () { return client_js_2.Limitless; } });
var server_manager_js_2 = require("./pmxt/server-manager.js");
Object.defineProperty(exports, "ServerManager", { enumerable: true, get: function () { return server_manager_js_2.ServerManager; } });
var models_js_1 = require("./pmxt/models.js");
Object.defineProperty(exports, "MarketList", { enumerable: true, get: function () { return models_js_1.MarketList; } });
const defaultManager = new server_manager_js_1.ServerManager();
async function stopServer() {
    await defaultManager.stop();
}
async function restartServer() {
    await defaultManager.restart();
}
const pmxt = {
    Exchange: client_js_1.Exchange,
    Polymarket: client_js_1.Polymarket,
    Kalshi: client_js_1.Kalshi,
    Limitless: client_js_1.Limitless,
    ServerManager: server_manager_js_1.ServerManager,
    stopServer,
    restartServer,
    ...models
};
exports.default = pmxt;
