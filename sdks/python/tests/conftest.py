"""
Shared test fixtures for pmxt unit tests.

Mocks the auto-generated pmxt_internal module so tests can run without
having to generate the OpenAPI client first.
"""

import sys
import types
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Ensure pmxt_internal is importable even when the generated/ dir is absent.
# The real module lives in sdks/python/generated/pmxt_internal/ and is
# produced by `npm run generate`.  For pure-unit tests we mock the entire
# package so that `from pmxt_internal import ...` succeeds.
# ---------------------------------------------------------------------------


def _ensure_pmxt_internal_mock():
    """Insert a mock pmxt_internal package into sys.modules if not present."""
    if "pmxt_internal" in sys.modules:
        return  # already available (maybe the real one or a prior mock)

    # Top-level package
    pkg = types.ModuleType("pmxt_internal")
    pkg.ApiClient = MagicMock
    pkg.Configuration = MagicMock

    # Sub-module: models
    models_mod = types.ModuleType("pmxt_internal.models")
    pkg.models = models_mod

    # Sub-module: api.default_api
    api_pkg = types.ModuleType("pmxt_internal.api")
    default_api_mod = types.ModuleType("pmxt_internal.api.default_api")
    default_api_mod.DefaultApi = MagicMock
    api_pkg.default_api = default_api_mod

    # Sub-module: exceptions
    exc_mod = types.ModuleType("pmxt_internal.exceptions")

    class _FakeApiException(Exception):
        """Stand-in for the generated ApiException."""

        def __init__(self, status=None, reason=None, body=None, **kwargs):
            self.status = status
            self.reason = reason
            self.body = body
            super().__init__(reason)

    exc_mod.ApiException = _FakeApiException

    # Register everything in sys.modules
    sys.modules["pmxt_internal"] = pkg
    sys.modules["pmxt_internal.models"] = models_mod
    sys.modules["pmxt_internal.api"] = api_pkg
    sys.modules["pmxt_internal.api.default_api"] = default_api_mod
    sys.modules["pmxt_internal.exceptions"] = exc_mod


# Run at import time so that conftest is processed before any test module
# tries to `import pmxt`.
_ensure_pmxt_internal_mock()
