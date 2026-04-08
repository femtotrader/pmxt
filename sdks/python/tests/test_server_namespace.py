"""
Tests for the namespaced server management API: pmxt.server.<command>().

Covers:
  - The new namespace exposes status / health / start / stop / restart / logs
  - status() returns a fresh dict snapshot derived from the lock file
  - logs() tails the log file and returns an empty list when missing
  - The deprecated pmxt.stop_server / pmxt.restart_server still work but warn
"""

import json
import time
import warnings
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pmxt
from pmxt.server_manager import ServerManager


class TestServerNamespaceShape(unittest.TestCase):
    def test_namespace_exposes_expected_commands(self):
        for name in ("status", "health", "start", "stop", "restart", "logs"):
            self.assertTrue(
                hasattr(pmxt.server, name),
                f"pmxt.server is missing command: {name}",
            )
            self.assertTrue(callable(getattr(pmxt.server, name)))

    def test_namespace_is_in_public_api(self):
        self.assertIn("server", pmxt.__all__)


class TestStatus(unittest.TestCase):
    def test_status_returns_fresh_dict_each_call(self):
        manager = ServerManager()
        with patch.object(manager, "get_server_info", return_value=None), \
             patch.object(manager, "is_server_alive", return_value=False):
            a = manager.status()
            b = manager.status()
        self.assertIsNot(a, b, "status() must return a new dict each call (immutability)")
        self.assertEqual(a["running"], False)
        self.assertIsNone(a["pid"])
        self.assertIsNone(a["port"])
        self.assertIsNone(a["uptime_seconds"])
        self.assertEqual(a["lock_file"], str(manager.lock_path))

    def test_status_populated_from_lock_file(self):
        manager = ServerManager()
        ts_seconds = time.time() - 12.0
        fake_info = {
            "pid": 4242,
            "port": 3847,
            "version": "2.17.1",
            "timestamp": ts_seconds,
        }
        with patch.object(manager, "get_server_info", return_value=fake_info), \
             patch.object(manager, "is_server_alive", return_value=True):
            snap = manager.status()
        self.assertTrue(snap["running"])
        self.assertEqual(snap["pid"], 4242)
        self.assertEqual(snap["port"], 3847)
        self.assertEqual(snap["version"], "2.17.1")
        self.assertIsNotNone(snap["uptime_seconds"])
        self.assertGreaterEqual(snap["uptime_seconds"], 11.0)

    def test_status_handles_millisecond_timestamps(self):
        manager = ServerManager()
        ts_ms = (time.time() - 5.0) * 1000.0
        fake_info = {"pid": 1, "port": 3847, "timestamp": ts_ms}
        with patch.object(manager, "get_server_info", return_value=fake_info), \
             patch.object(manager, "is_server_alive", return_value=False):
            snap = manager.status()
        self.assertIsNotNone(snap["uptime_seconds"])
        self.assertGreaterEqual(snap["uptime_seconds"], 4.0)
        self.assertLess(snap["uptime_seconds"], 10.0)


class TestHealth(unittest.TestCase):
    def test_health_delegates_to_check_health(self):
        manager = ServerManager()
        with patch.object(manager, "get_running_port", return_value=3847), \
             patch.object(manager, "_check_health", return_value=True) as mock_check:
            self.assertTrue(manager.health())
            mock_check.assert_called_once_with(3847, timeout=2)


class TestStartIsIdempotent(unittest.TestCase):
    def test_start_calls_ensure_server_running(self):
        manager = ServerManager()
        with patch.object(manager, "ensure_server_running") as mock_ensure:
            manager.start()
            mock_ensure.assert_called_once_with()


class TestLogs(unittest.TestCase):
    def test_logs_returns_empty_when_no_file(self):
        manager = ServerManager()
        with TemporaryDirectory() as tmp:
            manager.lock_path = Path(tmp) / "server.lock"
            self.assertEqual(manager.logs(), [])
            self.assertEqual(manager.logs(100), [])

    def test_logs_tails_n_lines(self):
        manager = ServerManager()
        with TemporaryDirectory() as tmp:
            manager.lock_path = Path(tmp) / "server.lock"
            log_file = Path(tmp) / "server.log"
            log_file.write_text("\n".join(f"line-{i}" for i in range(20)) + "\n")
            tail = manager.logs(5)
            self.assertEqual(tail, ["line-15", "line-16", "line-17", "line-18", "line-19"])

    def test_logs_returns_all_lines_when_n_exceeds(self):
        manager = ServerManager()
        with TemporaryDirectory() as tmp:
            manager.lock_path = Path(tmp) / "server.lock"
            log_file = Path(tmp) / "server.log"
            log_file.write_text("a\nb\nc\n")
            self.assertEqual(manager.logs(50), ["a", "b", "c"])

    def test_logs_zero_or_negative_returns_empty(self):
        manager = ServerManager()
        with TemporaryDirectory() as tmp:
            manager.lock_path = Path(tmp) / "server.lock"
            (Path(tmp) / "server.log").write_text("a\nb\n")
            self.assertEqual(manager.logs(0), [])
            self.assertEqual(manager.logs(-3), [])

    def test_logs_does_not_share_internal_state(self):
        manager = ServerManager()
        with TemporaryDirectory() as tmp:
            manager.lock_path = Path(tmp) / "server.lock"
            (Path(tmp) / "server.log").write_text("a\nb\nc\n")
            first = manager.logs()
            first.append("MUTATION")
            second = manager.logs()
            self.assertNotIn("MUTATION", second)


class TestBackwardCompatibility(unittest.TestCase):
    def test_stop_server_emits_deprecation_warning(self):
        with patch.object(pmxt._default_manager, "stop") as mock_stop:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                pmxt.stop_server()
            mock_stop.assert_called_once()
            self.assertTrue(
                any(issubclass(w.category, DeprecationWarning) for w in caught),
                "pmxt.stop_server() must emit DeprecationWarning",
            )

    def test_restart_server_emits_deprecation_warning(self):
        with patch.object(pmxt._default_manager, "restart") as mock_restart:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                pmxt.restart_server()
            mock_restart.assert_called_once()
            self.assertTrue(
                any(issubclass(w.category, DeprecationWarning) for w in caught),
                "pmxt.restart_server() must emit DeprecationWarning",
            )

    def test_namespace_and_legacy_share_same_manager(self):
        # The namespace must operate on the same default manager so that
        # state (lock file, etc.) is consistent across both APIs.
        with patch.object(pmxt._default_manager, "stop") as mock_stop:
            pmxt.server.stop()
            mock_stop.assert_called_once()


if __name__ == "__main__":
    unittest.main()
