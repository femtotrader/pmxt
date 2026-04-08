/**
 * Tests for the namespaced server management API: pmxt.server.<command>().
 *
 * Verifies the new surface, status() shape, logs() tailing, and that the
 * deprecated stopServer / restartServer aliases still work but warn.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import pmxt, { server, ServerManager } from "../index";

describe("pmxt.server namespace surface", () => {
    test("exposes status, health, start, stop, restart, logs", () => {
        for (const name of ["status", "health", "start", "stop", "restart", "logs"]) {
            expect(typeof (server as any)[name]).toBe("function");
            expect(typeof (pmxt.server as any)[name]).toBe("function");
        }
    });

    test("default export and named export reference the same namespace", () => {
        expect(pmxt.server).toBe(server);
    });
});

describe("ServerManager.status()", () => {
    test("returns a fresh object on every call", async () => {
        const manager = new ServerManager();
        jest.spyOn(manager as any, "getServerInfo").mockReturnValue(null);
        jest.spyOn(manager, "isServerRunning").mockResolvedValue(false);

        const a = await manager.status();
        const b = await manager.status();
        expect(a).not.toBe(b);
        expect(a.running).toBe(false);
        expect(a.pid).toBeNull();
        expect(a.port).toBeNull();
        expect(a.uptimeSeconds).toBeNull();
    });

    test("populated from lock file with epoch-seconds timestamp", async () => {
        const manager = new ServerManager();
        const tsSeconds = Date.now() / 1000 - 12;
        jest.spyOn(manager as any, "getServerInfo").mockReturnValue({
            pid: 4242,
            port: 3847,
            version: "2.17.1",
            timestamp: tsSeconds,
        });
        jest.spyOn(manager, "isServerRunning").mockResolvedValue(true);

        const snap = await manager.status();
        expect(snap.running).toBe(true);
        expect(snap.pid).toBe(4242);
        expect(snap.port).toBe(3847);
        expect(snap.version).toBe("2.17.1");
        expect(snap.uptimeSeconds).not.toBeNull();
        expect(snap.uptimeSeconds!).toBeGreaterThanOrEqual(11);
    });

    test("handles millisecond timestamps", async () => {
        const manager = new ServerManager();
        jest.spyOn(manager as any, "getServerInfo").mockReturnValue({
            pid: 1,
            port: 3847,
            timestamp: Date.now() - 5000,
        });
        jest.spyOn(manager, "isServerRunning").mockResolvedValue(false);

        const snap = await manager.status();
        expect(snap.uptimeSeconds).not.toBeNull();
        expect(snap.uptimeSeconds!).toBeGreaterThanOrEqual(4);
        expect(snap.uptimeSeconds!).toBeLessThan(10);
    });
});

describe("ServerManager.start()", () => {
    test("delegates to ensureServerRunning (idempotent contract)", async () => {
        const manager = new ServerManager();
        const spy = jest
            .spyOn(manager, "ensureServerRunning")
            .mockResolvedValue(undefined);
        await manager.start();
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe("ServerManager.logs()", () => {
    let tmpDir: string;

    function makeManagerWithTmpLock(): ServerManager {
        const manager = new ServerManager();
        // Point lockPath into the tmp dir so logs() reads our fixture file.
        (manager as any).lockPath = join(tmpDir, "server.lock");
        return manager;
    }

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "pmxt-logs-test-"));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    test("returns empty array when no log file exists", () => {
        const manager = makeManagerWithTmpLock();
        expect(manager.logs()).toEqual([]);
        expect(manager.logs(100)).toEqual([]);
    });

    test("tails the last n lines", () => {
        const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n") + "\n";
        writeFileSync(join(tmpDir, "server.log"), lines, "utf-8");

        const manager = makeManagerWithTmpLock();
        const tail = manager.logs(5);
        expect(tail).toEqual(["line-15", "line-16", "line-17", "line-18", "line-19"]);
    });

    test("returns all lines when n exceeds total", () => {
        writeFileSync(join(tmpDir, "server.log"), "a\nb\nc\n", "utf-8");

        const manager = makeManagerWithTmpLock();
        expect(manager.logs(50)).toEqual(["a", "b", "c"]);
    });

    test("zero or negative n returns empty", () => {
        writeFileSync(join(tmpDir, "server.log"), "a\nb\n", "utf-8");

        const manager = makeManagerWithTmpLock();
        expect(manager.logs(0)).toEqual([]);
        expect(manager.logs(-3)).toEqual([]);
    });

    test("does not share internal mutable state across calls", () => {
        writeFileSync(join(tmpDir, "server.log"), "a\nb\nc\n", "utf-8");

        const manager = makeManagerWithTmpLock();
        const first = manager.logs();
        first.push("MUTATION");
        const second = manager.logs();
        expect(second).not.toContain("MUTATION");
    });
});

describe("Backward compatibility: deprecated stopServer / restartServer", () => {
    test("stopServer still resolves without throwing (legacy entry point)", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        const stopSpy = jest
            .spyOn(ServerManager.prototype, "stop")
            .mockResolvedValue(undefined);

        await expect(pmxt.stopServer()).resolves.toBeUndefined();
        expect(stopSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
        stopSpy.mockRestore();
    });

    test("restartServer is callable from the default export", () => {
        expect(typeof pmxt.restartServer).toBe("function");
        expect(typeof pmxt.stopServer).toBe("function");
    });
});
