import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { withWatchTimeout, DEFAULT_WATCH_TIMEOUT_MS } from '../../src/utils/watch-timeout';

describe('withWatchTimeout', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('resolves when underlying promise resolves before timeout', async () => {
        const promise = new Promise<string>((resolve) => {
            setTimeout(() => resolve('data'), 100);
        });

        const result = withWatchTimeout(promise, 5000, 'test');

        jest.advanceTimersByTime(100);
        await expect(result).resolves.toBe('data');
    });

    test('rejects with timeout error when no data arrives', async () => {
        const promise = new Promise<string>(() => {
            // Never resolves
        });

        const result = withWatchTimeout(promise, 1000, "watchOrderBook('FAKE-ID')");

        jest.advanceTimersByTime(1000);
        await expect(result).rejects.toThrow(
            "watchOrderBook('FAKE-ID'): timed out after 1000ms waiting for data. " +
            "The ID may not exist on this exchange.",
        );
    });

    test('passes through rejection from underlying promise', async () => {
        const promise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('ws closed')), 50);
        });

        const result = withWatchTimeout(promise, 5000, 'test');

        jest.advanceTimersByTime(50);
        await expect(result).rejects.toThrow('ws closed');
    });

    test('returns promise directly when timeoutMs is 0 (disabled)', async () => {
        const original = new Promise<string>((resolve) => {
            setTimeout(() => resolve('ok'), 100);
        });

        const result = withWatchTimeout(original, 0, 'test');

        // Should be the same promise reference
        expect(result).toBe(original);

        jest.advanceTimersByTime(100);
        await expect(result).resolves.toBe('ok');
    });

    test('returns promise directly when timeoutMs is negative (disabled)', async () => {
        const original = new Promise<string>((resolve) => {
            setTimeout(() => resolve('ok'), 100);
        });

        const result = withWatchTimeout(original, -1, 'test');
        expect(result).toBe(original);
    });

    test('clears timeout timer when promise resolves', async () => {
        const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

        const promise = new Promise<string>((resolve) => {
            setTimeout(() => resolve('data'), 50);
        });

        const result = withWatchTimeout(promise, 5000, 'test');

        jest.advanceTimersByTime(50);
        await result;

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });

    test('default timeout constant is 30 seconds', () => {
        expect(DEFAULT_WATCH_TIMEOUT_MS).toBe(30_000);
    });
});
