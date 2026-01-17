"""
Server Manager for PMXT Python SDK

This module handles automatic server lifecycle management.
The pattern implemented here is universal and can be replicated in any language SDK.

Universal Pattern:
1. Check if server is running (via lock file + process check)
2. If not running, call pmxt-ensure-server launcher
3. Wait for health check to confirm server is ready
4. Proceed with API calls

This ensures zero-configuration usage across all SDKs.
"""

import os
import json
import time
import subprocess
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
import urllib.request
import urllib.error


class ServerManager:
    """
    Manages the PMXT sidecar server lifecycle.
    
    This class implements the universal server management pattern that
    should be replicated in all language SDKs (Java, C#, Go, etc.)
    """
    
    DEFAULT_PORT = 3847
    HEALTH_CHECK_TIMEOUT = 10  # seconds
    HEALTH_CHECK_INTERVAL = 0.1  # seconds
    
    def __init__(self, base_url: str = "http://localhost:3847"):
        """
        Initialize the server manager.
        
        Args:
            base_url: Base URL where server should be running
        """
        self.base_url = base_url
        self.lock_path = Path.home() / '.pmxt' / 'server.lock'
        self._port = self._extract_port_from_url(base_url)
    
    def _extract_port_from_url(self, url: str) -> int:
        """Extract port number from URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.port or self.DEFAULT_PORT
        except:
            return self.DEFAULT_PORT
    
    def ensure_server_running(self) -> None:
        """
        Ensure the PMXT server is running.
        
        This is the main entry point that SDKs should call.
        It implements the universal pattern:
        1. Check if server is alive
        2. If not, start it via launcher
        3. Wait for health check
        
        Raises:
            Exception: If server fails to start or become healthy
        """
        # Step 1: Check if server is already running
        if self.is_server_alive():
            return
        
        # Step 2: Start server via launcher
        self._start_server_via_launcher()
        
        # Step 3: Wait for health check
        self._wait_for_health()
    
    def is_server_alive(self) -> bool:
        """
        Check if the server is currently running and healthy.
        
        This implements the universal alive check:
        1. Read lock file
        2. Check if process exists
        3. Optionally verify health endpoint
        
        Returns:
            True if server is running and healthy, False otherwise
        """
        # Check lock file exists
        if not self.lock_path.exists():
            return False
        
        try:
            # Read lock file
            lock_data = json.loads(self.lock_path.read_text())
            pid = lock_data.get('pid')
            port = lock_data.get('port', self.DEFAULT_PORT)
            
            if not pid:
                return False
            
            # Check if process exists (cross-platform)
            if not self._is_process_running(pid):
                # Process doesn't exist, remove stale lock file
                self._remove_stale_lock()
                return False
            
            # Quick health check to verify server is responsive
            try:
                return self._check_health(port, timeout=1)
            except:
                # Process exists but not responding
                return False
                
        except (json.JSONDecodeError, OSError):
            return False
    
    def _is_process_running(self, pid: int) -> bool:
        """
        Check if a process with given PID is running.
        
        Cross-platform implementation.
        """
        try:
            # Signal 0 doesn't kill the process, just checks if it exists
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False
    
    def _remove_stale_lock(self) -> None:
        """Remove stale lock file."""
        try:
            self.lock_path.unlink()
        except:
            pass
    
    def _start_server_via_launcher(self) -> None:
        """
        Start the server using the pmxt-ensure-server launcher.
        """
        # 1. Check for local development paths first
        current_file = Path(__file__).resolve()
        # Look for ../../bin/pmxt-ensure-server (monorepo structure)
        local_launcher = current_file.parent.parent.parent / 'bin' / 'pmxt-ensure-server'
        
        launcher = str(local_launcher) if local_launcher.exists() else shutil.which('pmxt-ensure-server')
        
        if not launcher:
            raise Exception(
                "pmxt-ensure-server not found.\n"
                "Local search failed and not in PATH.\n"
                "Please install the server: npm install -g pmxtjs"
            )
        
        # Call the launcher
        try:
            # If it's a JS file and we are calling it directly, might need node
            cmd = [launcher]
            if launcher.endswith('.js') or not os.access(launcher, os.X_OK):
                cmd = ['node', launcher]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.HEALTH_CHECK_TIMEOUT
            )
            
            if result.returncode != 0:
                raise Exception(
                    f"Failed to start server: {result.stderr or result.stdout}"
                )
        except subprocess.TimeoutExpired:
            raise Exception("Server startup timeout")
        except Exception as e:
            raise Exception(f"Failed to start server: {e}")
    
    def _wait_for_health(self) -> None:
        """
        Wait for the server to respond to health checks.
        
        Universal pattern: Poll /health endpoint until it responds or timeout.
        """
        start_time = time.time()
        
        while time.time() - start_time < self.HEALTH_CHECK_TIMEOUT:
            try:
                if self._check_health(self._port):
                    return
            except:
                pass
            
            time.sleep(self.HEALTH_CHECK_INTERVAL)
        
        raise Exception(
            f"Server failed to become healthy within {self.HEALTH_CHECK_TIMEOUT}s"
        )
    
    def _check_health(self, port: int, timeout: int = 2) -> bool:
        """
        Check if server is healthy by calling /health endpoint.
        
        Args:
            port: Port to check
            timeout: Request timeout in seconds
            
        Returns:
            True if server responds with 200 OK
        """
        try:
            url = f"http://localhost:{port}/health"
            req = urllib.request.Request(url)
            
            with urllib.request.urlopen(req, timeout=timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return data.get('status') == 'ok'
            
            return False
        except (urllib.error.URLError, urllib.error.HTTPError, Exception):
            return False
    
    def get_server_info(self) -> Optional[Dict[str, Any]]:
        """
        Get information about the running server from lock file.
        
        Returns:
            Dictionary with server info (port, pid, timestamp) or None
        """
        if not self.lock_path.exists():
            return None
        
        try:
            return json.loads(self.lock_path.read_text())
        except:
            return None
