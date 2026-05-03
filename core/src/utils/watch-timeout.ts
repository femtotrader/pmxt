/**
 * Default timeout for watch methods (30 seconds).
 *
 * Generous enough for valid but illiquid markets, but prevents
 * hanging forever on non-existing IDs.
 */
export const DEFAULT_WATCH_TIMEOUT_MS = 30_000;

/**
 * Wrap a watch promise with a timeout that rejects if no data arrives.
 *
 * Used by all exchange WebSocket implementations to prevent indefinite
 * hangs when subscribing to non-existing market IDs.
 *
 * @param promise  - The data promise (resolves when WS data arrives)
 * @param timeoutMs - Maximum time to wait in milliseconds (0 = no timeout)
 * @param label     - Human-readable label for the error message
 */
export function withWatchTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
): Promise<T> {
    if (timeoutMs <= 0) return promise;

    let timer: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(
                `${label}: timed out after ${timeoutMs}ms waiting for data. ` +
                `The ID may not exist on this exchange.`,
            ));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timer);
    });
}
