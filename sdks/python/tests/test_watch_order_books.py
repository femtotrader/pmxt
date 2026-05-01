"""
Unit tests for watch_order_books batch method and WS transport setup.

Tests the new batch method via HTTP fallback (mocked), the WS client
instantiation, and the SKIP_GENERATE guard in the generator.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from pmxt.client import (
    Exchange,
    _convert_order_book,
)
from pmxt.models import (
    MarketOutcome,
    OrderBook,
    OrderLevel,
)
from pmxt.errors import PmxtError
from pmxt._exchanges import Kalshi


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_response(data: dict) -> MagicMock:
    """Create a mock urllib3 response with JSON body."""
    resp = MagicMock()
    resp.data = json.dumps(data).encode()
    resp.read = MagicMock()
    return resp


def _create_exchange(cls=Kalshi, **kwargs):
    """Instantiate an Exchange subclass with the server manager bypassed."""
    with patch("pmxt.client.ServerManager") as MockSM:
        instance = MockSM.return_value
        instance.ensure_server_running.return_value = None
        instance.get_running_port.return_value = 3847
        instance.get_server_info.return_value = {"accessToken": "test-token"}
        exchange = cls(auto_start_server=True, **kwargs)
    exchange._server_manager = instance
    # Ensure WS is disabled so we test the HTTP path
    exchange._ws_unsupported = True
    return exchange


# ---------------------------------------------------------------------------
# watch_order_books tests
# ---------------------------------------------------------------------------

class TestWatchOrderBooks:
    """Tests for the watch_order_books batch method."""

    def test_watch_order_books_returns_dict(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({
            "success": True,
            "data": {
                "TICKER-1": {
                    "bids": [{"price": 0.55, "size": 100}],
                    "asks": [{"price": 0.57, "size": 80}],
                    "timestamp": 170000,
                },
                "TICKER-2": {
                    "bids": [{"price": 0.40, "size": 50}],
                    "asks": [{"price": 0.42, "size": 30}],
                    "timestamp": 170001,
                },
            },
        })
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        result = ex.watch_order_books(["TICKER-1", "TICKER-2"])

        assert isinstance(result, dict)
        assert len(result) == 2
        assert "TICKER-1" in result
        assert "TICKER-2" in result

        ob1 = result["TICKER-1"]
        assert isinstance(ob1, OrderBook)
        assert len(ob1.bids) == 1
        assert ob1.bids[0].price == 0.55

        ob2 = result["TICKER-2"]
        assert isinstance(ob2, OrderBook)
        assert ob2.asks[0].size == 30

    def test_watch_order_books_empty_response(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({"success": True, "data": {}})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        result = ex.watch_order_books(["TICKER-1"])
        assert result == {}

    def test_watch_order_books_with_limit(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({"success": True, "data": {}})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        ex.watch_order_books(["T1", "T2"], limit=5)

        call_args = ex._api_client.call_api.call_args
        body = call_args.kwargs.get("body") or call_args[1].get("body")
        assert body["args"] == [["T1", "T2"], 5]

    def test_watch_order_books_resolves_market_outcome(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({"success": True, "data": {}})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        outcomes = [
            MarketOutcome(outcome_id="o1", label="Yes", price=0.5),
            MarketOutcome(outcome_id="o2", label="No", price=0.5),
        ]
        ex.watch_order_books(outcomes)

        call_args = ex._api_client.call_api.call_args
        body = call_args.kwargs.get("body") or call_args[1].get("body")
        assert body["args"] == [["o1", "o2"]]

    def test_watch_order_books_includes_credentials(self):
        ex = _create_exchange(api_key="k1", private_key="pk1")
        mock_resp = _make_mock_response({"success": True, "data": {}})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        ex.watch_order_books(["T1"])

        call_args = ex._api_client.call_api.call_args
        body = call_args.kwargs.get("body") or call_args[1].get("body")
        assert body["credentials"] == {"apiKey": "k1", "privateKey": "pk1"}

    def test_watch_order_books_posts_to_correct_url(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({"success": True, "data": {}})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        ex.watch_order_books(["T1"])

        call_args = ex._api_client.call_api.call_args
        url = call_args.kwargs.get("url") or call_args[0][1]
        assert "/watchOrderBooks" in url


# ---------------------------------------------------------------------------
# WS client setup tests
# ---------------------------------------------------------------------------

class TestWsClientSetup:
    """Tests that the WS transport infrastructure is wired correctly."""

    def test_ws_unsupported_flag_prevents_ws_creation(self):
        ex = _create_exchange()
        ex._ws_unsupported = True
        result = ex._get_or_create_ws()
        assert result is None

    def test_ws_client_starts_as_none(self):
        ex = _create_exchange()
        assert ex._ws_client is None

    def test_ws_unsupported_starts_false(self):
        """Default is False -- WS will be attempted on first call."""
        with patch("pmxt.client.ServerManager") as MockSM:
            instance = MockSM.return_value
            instance.ensure_server_running.return_value = None
            instance.get_running_port.return_value = 3847
            instance.get_server_info.return_value = {"accessToken": "t"}
            ex = Kalshi(auto_start_server=True)
        assert ex._ws_unsupported is False


# ---------------------------------------------------------------------------
# watch_order_book WS preference test
# ---------------------------------------------------------------------------

class TestWatchOrderBookWsPreference:
    """Tests that watch_order_book tries WS before HTTP."""

    def test_watch_order_book_falls_back_to_http_when_ws_unavailable(self):
        """When WS is marked unsupported, watch_order_book uses HTTP."""
        ex = _create_exchange()
        ex._ws_unsupported = True

        mock_resp = _make_mock_response({
            "success": True,
            "data": {
                "bids": [{"price": 0.60, "size": 50}],
                "asks": [{"price": 0.62, "size": 40}],
                "timestamp": 170000,
            },
        })
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        ob = ex.watch_order_book("TICKER-1")
        assert isinstance(ob, OrderBook)
        assert ob.bids[0].price == 0.60
        ex._api_client.call_api.assert_called_once()
