import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server as HttpServer } from "http";
import { ExchangeCredentials } from "../BaseExchange";
import { BaseError } from "../errors";
import { createExchange } from "./exchange-factory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscribeMessage {
  id: string;
  action: "subscribe";
  exchange: string;
  method: string;
  args: unknown[];
  credentials?: ExchangeCredentials;
}

interface UnsubscribeMessage {
  id: string;
  action: "unsubscribe";
  exchange: string;
  method: string;
  args: unknown[];
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage;

interface DataEvent {
  id: string;
  event: "data";
  method: string;
  symbol: string;
  data: unknown;
}

interface ErrorEvent {
  event: "error";
  id?: string;
  error: { message: string; code?: string };
}

interface SubscribedEvent {
  event: "subscribed";
  id: string;
}

type ServerEvent = DataEvent | ErrorEvent | SubscribedEvent;

/** Tracks an active streaming subscription so it can be cancelled. */
interface ActiveSubscription {
  abortController: AbortController;
}

/** Per-client state. */
interface ClientState {
  subscriptions: Map<string, ActiveSubscription>;
  exchanges: Map<string, unknown>;
  authenticated: boolean;
}

export interface CreateWebSocketHandlerOptions {
  /** Access token for authentication (same as x-pmxt-access-token). */
  accessToken?: string;
}

// ---------------------------------------------------------------------------
// Streaming methods
// ---------------------------------------------------------------------------

/** Set of method names that produce streaming data. */
const WATCH_METHODS = new Set([
  "watchOrderBook",
  "watchOrderBooks",
  "watchTrades",
]);

/** Methods for unsubscribing. */
const UNWATCH_METHODS: Record<string, string> = {
  unwatchOrderBook: "watchOrderBook",
};

function send(ws: WebSocket, msg: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, id: string | undefined, message: string, code?: string): void {
  send(ws, { event: "error", id, error: { message, code } });
}

/**
 * Build a unique key for a subscription so we can cancel it.
 */
function subscriptionKey(msg: ClientMessage): string {
  return `${msg.exchange}:${msg.method}:${JSON.stringify(msg.args)}`;
}

/**
 * Start a streaming loop for a single-ticker watch method
 * (watchOrderBook, watchTrades).
 *
 * The exchange layer owns connection lifecycle — watchOrderBook() blocks until
 * data arrives, transparently handling reconnection. This loop is a simple
 * consumer that only terminates on abort or fatal errors.
 */
async function streamSingle(
  exchange: any,
  method: string,
  args: unknown[],
  id: string,
  ws: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  const symbol = typeof args[0] === "string" ? args[0] : String(args[0]);

  // Send subscribed acknowledgement
  send(ws, { event: "subscribed", id });

  while (!signal.aborted && ws.readyState === WebSocket.OPEN) {
    try {
      const result = await exchange[method](...args);
      if (signal.aborted) break;
      send(ws, { id, event: "data", method, symbol, data: result });
    } catch (err: unknown) {
      if (signal.aborted) break;
      const message =
        err instanceof BaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown streaming error";
      const code =
        err instanceof BaseError ? err.code : undefined;
      sendError(ws, id, message, code);
      // Fatal error from exchange (terminated, auth failure, etc.) — stop streaming.
      // The exchange layer handles transient reconnection internally and should
      // never throw for recoverable connection drops.
      break;
    }
  }
}

/**
 * Start a streaming loop for the batch watchOrderBooks method.
 * Each update is sent as an individual data message per symbol.
 *
 * Same lifecycle contract as streamSingle — the exchange owns reconnection.
 */
async function streamBatch(
  exchange: any,
  method: string,
  args: unknown[],
  id: string,
  ws: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  const ids = Array.isArray(args[0]) ? (args[0] as string[]) : [];

  send(ws, { event: "subscribed", id });

  while (!signal.aborted && ws.readyState === WebSocket.OPEN) {
    try {
      const result: Record<string, unknown> = await exchange[method](...args);
      if (signal.aborted) break;
      for (const [symbol, data] of Object.entries(result)) {
        send(ws, { id, event: "data", method, symbol, data });
      }
    } catch (err: unknown) {
      if (signal.aborted) break;
      const message =
        err instanceof BaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown streaming error";
      const code =
        err instanceof BaseError ? err.code : undefined;
      sendError(ws, id, message, code);
      // Fatal error — stop streaming. Exchange handles transient reconnection.
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a WebSocket handler that can be attached to an HTTP server.
 *
 * Usage:
 * ```ts
 * const server = app.listen(port);
 * const wss = createWebSocketHandler({ accessToken });
 * wss.attach(server);
 * ```
 */
export function createWebSocketHandler(
  options: CreateWebSocketHandlerOptions = {},
): { wss: WebSocketServer; attach: (server: HttpServer) => void } {
  const { accessToken } = options;

  const wss = new WebSocketServer({ noServer: true });

  function attach(server: HttpServer): void {
    server.on("upgrade", (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);

      // Only handle upgrades to /ws
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      // Validate access token from query parameter if configured
      if (accessToken) {
        const token =
          url.searchParams.get("token") ||
          request.headers["x-pmxt-access-token"];
        if (!token || token !== accessToken) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  }

  wss.on("connection", (ws: WebSocket) => {
    const state: ClientState = {
      subscriptions: new Map(),
      exchanges: new Map(),
      authenticated: !accessToken, // pre-authed if no token required
    };

    ws.on("message", (raw: Buffer | string) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
      } catch {
        sendError(ws, undefined, "Invalid JSON");
        return;
      }

      const id = parsed.id as string | undefined;
      const action = parsed.action as string | undefined;
      const exchange = parsed.exchange as string | undefined;

      if (!id || !action || !exchange) {
        sendError(ws, id, "Missing required fields: id, action, exchange");
        return;
      }

      const exchangeName = exchange.toLowerCase();

      if (action === "subscribe") {
        const msg: SubscribeMessage = {
          id,
          action: "subscribe",
          exchange: exchangeName,
          method: parsed.method as string,
          args: (parsed.args as unknown[]) || [],
          credentials: parsed.credentials as ExchangeCredentials | undefined,
        };
        handleSubscribe(ws, state, msg, exchangeName);
      } else if (action === "unsubscribe") {
        const msg: UnsubscribeMessage = {
          id,
          action: "unsubscribe",
          exchange: exchangeName,
          method: parsed.method as string,
          args: (parsed.args as unknown[]) || [],
        };
        handleUnsubscribe(ws, state, msg, exchangeName);
      } else {
        sendError(ws, id, `Unknown action: ${action}`);
      }
    });

    ws.on("close", () => {
      // Abort all active subscriptions
      for (const [, sub] of state.subscriptions) {
        sub.abortController.abort();
      }
      state.subscriptions.clear();

      // Close all exchange instances
      for (const [, exchange] of state.exchanges) {
        if (typeof (exchange as any).close === "function") {
          (exchange as any).close().catch(() => {});
        }
      }
      state.exchanges.clear();
    });

    ws.on("error", () => {
      // Abort subscriptions on error too
      for (const [, sub] of state.subscriptions) {
        sub.abortController.abort();
      }
    });
  });

  return { wss, attach };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function getOrCreateExchange(
  state: ClientState,
  exchangeName: string,
  credentials?: ExchangeCredentials,
): unknown {
  // Use credentials as part of the cache key to support multiple auths
  const cacheKey =
    credentials && (credentials.apiKey || credentials.privateKey)
      ? `${exchangeName}:${credentials.apiKey || ""}:${credentials.privateKey || ""}`
      : exchangeName;

  const existing = state.exchanges.get(cacheKey);
  if (existing) return existing;

  const exchange = createExchange(exchangeName, credentials);
  state.exchanges.set(cacheKey, exchange);
  return exchange;
}

function handleSubscribe(
  ws: WebSocket,
  state: ClientState,
  msg: SubscribeMessage,
  exchangeName: string,
): void {
  const { id, method, args, credentials } = msg;

  if (!WATCH_METHODS.has(method)) {
    sendError(ws, id, `Method '${method}' is not a streaming method. Use the HTTP API for non-streaming calls.`);
    return;
  }

  const key = subscriptionKey(msg);

  // Already subscribed
  if (state.subscriptions.has(key)) {
    sendError(ws, id, `Already subscribed to ${key}`);
    return;
  }

  let exchange: unknown;
  try {
    exchange = getOrCreateExchange(state, exchangeName, credentials);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create exchange";
    sendError(ws, id, message);
    return;
  }

  if (typeof (exchange as any)[method] !== "function") {
    sendError(ws, id, `Method '${method}' not found on ${exchangeName}`);
    return;
  }

  const abortController = new AbortController();
  state.subscriptions.set(key, { abortController });

  const streamFn = method === "watchOrderBooks" ? streamBatch : streamSingle;

  // Fire and forget -- the loop runs until aborted or WS closes
  streamFn(
    exchange,
    method,
    args || [],
    id,
    ws,
    abortController.signal,
  ).catch(() => {
    // Stream ended -- clean up
    state.subscriptions.delete(key);
  });
}

function handleUnsubscribe(
  ws: WebSocket,
  state: ClientState,
  msg: ClientMessage,
  exchangeName: string,
): void {
  const { id } = msg;

  // Build the key of the subscription to cancel.
  // For unsubscribe actions, the corresponding subscribe key uses the watch method.
  const watchMethod = UNWATCH_METHODS[msg.method] || msg.method;
  const lookupMsg = { ...msg, method: watchMethod };
  const key = subscriptionKey(lookupMsg);

  const sub = state.subscriptions.get(key);
  if (!sub) {
    sendError(ws, id, `No active subscription for ${key}`);
    return;
  }

  sub.abortController.abort();
  state.subscriptions.delete(key);

  send(ws, { event: "subscribed", id }); // Acknowledge unsubscribe
}
