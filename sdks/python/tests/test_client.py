"""
Unit tests for the PMXT Python client wrapper.

Tests the Exchange client, response parsing, error handling, and data model
conversions using mocks — no sidecar server required.
"""

import json
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from pmxt.client import (
    Exchange,
    _convert_market,
    _convert_event,
    _convert_outcome,
    _convert_candle,
    _convert_order_book,
    _convert_trade,
    _convert_user_trade,
    _convert_order,
    _convert_built_order,
    _convert_position,
    _convert_balance,
    _convert_execution_result,
)
from pmxt.errors import (
    PmxtError,
    BadRequest,
    AuthenticationError,
    NotFoundError,
    MarketNotFound,
    RateLimitExceeded,
    InvalidOrder,
    InsufficientFunds,
    ValidationError,
    NetworkError,
    ExchangeNotAvailable,
    from_server_error,
)
from pmxt.models import (
    UnifiedMarket,
    UnifiedEvent,
    MarketOutcome,
    MarketList,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    UserTrade,
    PaginatedMarketsResult,
    Order,
    BuiltOrder,
    Position,
    Balance,
    ExecutionPriceResult,
)
from pmxt._exchanges import Polymarket, Kalshi, KalshiDemo, Limitless


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
    # Keep the mock server manager accessible for assertions
    exchange._server_manager = instance
    return exchange


# ---------------------------------------------------------------------------
# Converter / data-model tests
# ---------------------------------------------------------------------------

class TestConverters:
    """Tests for the raw-dict -> dataclass conversion functions."""

    def test_convert_outcome(self):
        raw = {
            "outcomeId": "tok-123",
            "label": "Yes",
            "price": 0.65,
            "priceChange24h": 0.03,
            "metadata": {"extra": 1},
            "marketId": "mkt-1",
        }
        o = _convert_outcome(raw)
        assert isinstance(o, MarketOutcome)
        assert o.outcome_id == "tok-123"
        assert o.label == "Yes"
        assert o.price == 0.65
        assert o.price_change_24h == 0.03
        assert o.market_id == "mkt-1"

    def test_convert_outcome_missing_optional_fields(self):
        raw = {"outcomeId": "tok-1", "label": "No", "price": 0.35}
        o = _convert_outcome(raw)
        assert o.price_change_24h is None
        assert o.metadata is None
        assert o.market_id is None

    def test_convert_market_basic(self):
        raw = {
            "marketId": "mkt-1",
            "title": "Will it rain?",
            "outcomes": [
                {"outcomeId": "o1", "label": "Yes", "price": 0.7},
                {"outcomeId": "o2", "label": "No", "price": 0.3},
            ],
            "volume24h": 5000.0,
            "liquidity": 12000.0,
            "url": "https://example.com/mkt-1",
            "description": "Rain market",
            "category": "Weather",
            "tags": ["weather", "daily"],
        }
        m = _convert_market(raw)
        assert isinstance(m, UnifiedMarket)
        assert m.market_id == "mkt-1"
        assert m.title == "Will it rain?"
        assert len(m.outcomes) == 2
        assert m.volume_24h == 5000.0
        assert m.liquidity == 12000.0
        assert m.category == "Weather"
        assert m.tags == ["weather", "daily"]
        assert m.question == "Will it rain?"  # alias property

    def test_convert_market_with_yes_no(self):
        raw = {
            "marketId": "mkt-2",
            "title": "Binary market",
            "outcomes": [],
            "volume24h": 0,
            "liquidity": 0,
            "url": "https://example.com/mkt-2",
            "yes": {"outcomeId": "y1", "label": "Yes", "price": 0.6},
            "no": {"outcomeId": "n1", "label": "No", "price": 0.4},
        }
        m = _convert_market(raw)
        assert m.yes is not None
        assert m.yes.price == 0.6
        assert m.no is not None
        assert m.no.price == 0.4
        assert m.up is None
        assert m.down is None

    def test_convert_market_resolution_date_iso(self):
        raw = {
            "marketId": "mkt-3",
            "title": "Date market",
            "outcomes": [],
            "volume24h": 0,
            "liquidity": 0,
            "url": "https://example.com",
            "resolutionDate": "2026-12-31T23:59:59Z",
        }
        m = _convert_market(raw)
        assert m.resolution_date is not None
        assert m.resolution_date.year == 2026
        assert m.resolution_date.month == 12

    def test_convert_market_resolution_date_invalid(self):
        raw = {
            "marketId": "mkt-4",
            "title": "Bad date",
            "outcomes": [],
            "volume24h": 0,
            "liquidity": 0,
            "url": "",
            "resolutionDate": "not-a-date",
        }
        m = _convert_market(raw)
        assert m.resolution_date is None

    def test_convert_event(self):
        raw = {
            "id": "evt-1",
            "title": "US Election",
            "description": "2028 election",
            "slug": "us-election-2028",
            "markets": [
                {
                    "marketId": "mkt-e1",
                    "title": "Winner?",
                    "outcomes": [],
                    "volume24h": 100,
                    "liquidity": 200,
                    "url": "",
                },
            ],
            "url": "https://example.com/evt-1",
            "image": "https://img.example.com/1.png",
            "category": "Politics",
            "tags": ["election"],
        }
        e = _convert_event(raw)
        assert isinstance(e, UnifiedEvent)
        assert e.id == "evt-1"
        assert e.slug == "us-election-2028"
        assert isinstance(e.markets, MarketList)
        assert len(e.markets) == 1
        assert e.markets[0].title == "Winner?"

    def test_convert_candle(self):
        raw = {
            "timestamp": 1700000000000,
            "open": 0.50,
            "high": 0.55,
            "low": 0.48,
            "close": 0.52,
            "volume": 1234.5,
        }
        c = _convert_candle(raw)
        assert isinstance(c, PriceCandle)
        assert c.timestamp == 1700000000000
        assert c.open == 0.50
        assert c.close == 0.52
        assert c.volume == 1234.5

    def test_convert_order_book(self):
        raw = {
            "bids": [{"price": 0.60, "size": 100}, {"price": 0.59, "size": 50}],
            "asks": [{"price": 0.62, "size": 80}],
            "timestamp": 1700000000000,
        }
        ob = _convert_order_book(raw)
        assert isinstance(ob, OrderBook)
        assert len(ob.bids) == 2
        assert len(ob.asks) == 1
        assert ob.bids[0].price == 0.60
        assert ob.asks[0].size == 80

    def test_convert_trade(self):
        raw = {"id": "t-1", "timestamp": 170000, "price": 0.55, "amount": 10.0, "side": "buy"}
        t = _convert_trade(raw)
        assert isinstance(t, Trade)
        assert t.id == "t-1"
        assert t.side == "buy"

    def test_convert_trade_default_side(self):
        raw = {"id": "t-2", "timestamp": 170001, "price": 0.4, "amount": 5.0}
        t = _convert_trade(raw)
        assert t.side == "unknown"

    def test_convert_user_trade(self):
        raw = {
            "id": "ut-1",
            "timestamp": 170002,
            "price": 0.5,
            "amount": 20.0,
            "side": "sell",
            "orderId": "ord-99",
        }
        ut = _convert_user_trade(raw)
        assert isinstance(ut, UserTrade)
        assert ut.order_id == "ord-99"

    def test_convert_order(self):
        raw = {
            "id": "ord-1",
            "marketId": "mkt-1",
            "outcomeId": "o-1",
            "side": "buy",
            "type": "limit",
            "amount": 50.0,
            "status": "open",
            "filled": 10.0,
            "remaining": 40.0,
            "timestamp": 170000,
            "price": 0.55,
            "fee": 0.02,
        }
        o = _convert_order(raw)
        assert isinstance(o, Order)
        assert o.id == "ord-1"
        assert o.side == "buy"
        assert o.type == "limit"
        assert o.filled == 10.0

    def test_convert_built_order(self):
        raw = {
            "exchange": "polymarket",
            "params": {"side": "buy"},
            "raw": {"native": True},
            "signedOrder": {"sig": "0x123"},
            "tx": None,
        }
        bo = _convert_built_order(raw)
        assert isinstance(bo, BuiltOrder)
        assert bo.exchange == "polymarket"
        assert bo.signed_order == {"sig": "0x123"}
        assert bo.tx is None

    def test_convert_position(self):
        raw = {
            "marketId": "mkt-1",
            "outcomeId": "o-1",
            "outcomeLabel": "Yes",
            "size": 100.0,
            "entryPrice": 0.50,
            "currentPrice": 0.60,
            "unrealizedPnL": 10.0,
            "realizedPnL": 5.0,
        }
        p = _convert_position(raw)
        assert isinstance(p, Position)
        assert p.size == 100.0
        assert p.unrealized_pnl == 10.0

    def test_convert_balance(self):
        raw = {"currency": "USDC", "total": 1000.0, "available": 800.0, "locked": 200.0}
        b = _convert_balance(raw)
        assert isinstance(b, Balance)
        assert b.currency == "USDC"
        assert b.available == 800.0

    def test_convert_execution_result(self):
        raw = {"price": 0.55, "filledAmount": 100.0, "fullyFilled": True}
        r = _convert_execution_result(raw)
        assert isinstance(r, ExecutionPriceResult)
        assert r.price == 0.55
        assert r.fully_filled is True

    def test_convert_execution_result_defaults(self):
        r = _convert_execution_result({})
        assert r.price == 0
        assert r.filled_amount == 0
        assert r.fully_filled is False


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Tests for error parsing and the error class hierarchy."""

    def test_from_server_error_maps_known_codes(self):
        cases = [
            ("BAD_REQUEST", BadRequest),
            ("AUTHENTICATION_ERROR", AuthenticationError),
            ("NOT_FOUND", NotFoundError),
            ("MARKET_NOT_FOUND", MarketNotFound),
            ("RATE_LIMIT_EXCEEDED", RateLimitExceeded),
            ("INVALID_ORDER", InvalidOrder),
            ("INSUFFICIENT_FUNDS", InsufficientFunds),
            ("VALIDATION_ERROR", ValidationError),
            ("NETWORK_ERROR", NetworkError),
            ("EXCHANGE_NOT_AVAILABLE", ExchangeNotAvailable),
        ]
        for code, expected_cls in cases:
            err = from_server_error({"message": "test", "code": code})
            assert isinstance(err, expected_cls), f"Expected {expected_cls} for code {code}"
            assert err.message == "test"
            assert err.code == code

    def test_from_server_error_unknown_code(self):
        err = from_server_error({"message": "boom", "code": "SOMETHING_WEIRD"})
        assert isinstance(err, PmxtError)
        assert err.code == "SOMETHING_WEIRD"

    def test_from_server_error_string_input(self):
        err = from_server_error("raw error string")
        assert isinstance(err, PmxtError)
        assert err.message == "raw error string"

    def test_from_server_error_retryable_and_exchange(self):
        err = from_server_error({
            "message": "rate limited",
            "code": "RATE_LIMIT_EXCEEDED",
            "retryable": True,
            "exchange": "kalshi",
            "retryAfter": 30,
        })
        assert isinstance(err, RateLimitExceeded)
        assert err.retryable is True
        assert err.exchange == "kalshi"
        assert err.retry_after == 30

    def test_from_server_error_validation_field(self):
        err = from_server_error({
            "message": "bad field",
            "code": "VALIDATION_ERROR",
            "field": "amount",
        })
        assert isinstance(err, ValidationError)
        assert err.field == "amount"

    def test_pmxt_error_str_with_exchange(self):
        err = PmxtError("oh no", exchange="polymarket")
        assert "[polymarket]" in str(err)

    def test_pmxt_error_str_without_exchange(self):
        err = PmxtError("oh no")
        assert str(err) == "oh no"


# ---------------------------------------------------------------------------
# MarketList.match() tests
# ---------------------------------------------------------------------------

class TestMarketListMatch:
    """Tests for the MarketList.match() convenience method."""

    def _make_list(self):
        m1 = UnifiedMarket(
            market_id="1", title="Trump wins", outcomes=[], volume_24h=0,
            liquidity=0, url="", description="Election market", category="Politics",
            tags=["election"],
        )
        m2 = UnifiedMarket(
            market_id="2", title="Bitcoin above 100K", outcomes=[], volume_24h=0,
            liquidity=0, url="", description="Crypto market", category="Crypto",
        )
        return MarketList([m1, m2])

    def test_match_single_result(self):
        ml = self._make_list()
        result = ml.match("Trump")
        assert result.market_id == "1"

    def test_match_case_insensitive(self):
        ml = self._make_list()
        result = ml.match("bitcoin")
        assert result.market_id == "2"

    def test_match_no_results_raises(self):
        ml = self._make_list()
        with pytest.raises(ValueError, match="No markets matching"):
            ml.match("nonexistent")

    def test_match_multiple_results_raises(self):
        m1 = UnifiedMarket(
            market_id="1", title="Foo bar", outcomes=[], volume_24h=0,
            liquidity=0, url="",
        )
        m2 = UnifiedMarket(
            market_id="2", title="Foo baz", outcomes=[], volume_24h=0,
            liquidity=0, url="",
        )
        ml = MarketList([m1, m2])
        with pytest.raises(ValueError, match="Multiple markets matching"):
            ml.match("Foo")

    def test_match_search_in_description(self):
        ml = self._make_list()
        result = ml.match("Crypto", search_in=["description"])
        assert result.market_id == "2"

    def test_match_search_in_category(self):
        ml = self._make_list()
        result = ml.match("Politics", search_in=["category"])
        assert result.market_id == "1"

    def test_match_search_in_tags(self):
        ml = self._make_list()
        result = ml.match("election", search_in=["tags"])
        assert result.market_id == "1"

    def test_match_search_in_outcomes(self):
        m = UnifiedMarket(
            market_id="3", title="Some market",
            outcomes=[MarketOutcome(outcome_id="o1", label="Red Team", price=0.5)],
            volume_24h=0, liquidity=0, url="",
        )
        ml = MarketList([m])
        result = ml.match("Red", search_in=["outcomes"])
        assert result.market_id == "3"


# ---------------------------------------------------------------------------
# Exchange initialization tests
# ---------------------------------------------------------------------------

class TestExchangeInit:
    """Tests for Exchange and subclass construction."""

    def test_kalshi_init(self):
        ex = _create_exchange(Kalshi)
        assert ex.exchange_name == "kalshi"

    def test_polymarket_init(self):
        ex = _create_exchange(Polymarket)
        assert ex.exchange_name == "polymarket"

    def test_kalshi_demo_init(self):
        ex = _create_exchange(KalshiDemo)
        assert ex.exchange_name == "kalshi-demo"

    def test_limitless_init(self):
        ex = _create_exchange(Limitless)
        assert ex.exchange_name == "limitless"

    def test_exchange_stores_credentials(self):
        ex = _create_exchange(Kalshi, api_key="key123", private_key="pk456")
        assert ex.api_key == "key123"
        assert ex.private_key == "pk456"

    def test_auto_start_disabled(self):
        """When auto_start_server=False, ServerManager.ensure_server_running is not called."""
        with patch("pmxt.client.ServerManager") as MockSM:
            with patch("pmxt.client.ApiClient"):
                with patch("pmxt.client.DefaultApi"):
                    ex = Kalshi(auto_start_server=False)
                    MockSM.return_value.ensure_server_running.assert_not_called()

    def test_credentials_dict_with_api_key(self):
        ex = _create_exchange(Kalshi, api_key="k", private_key="p")
        creds = ex._get_credentials_dict()
        assert creds == {"apiKey": "k", "privateKey": "p"}

    def test_credentials_dict_empty(self):
        ex = _create_exchange(Kalshi)
        creds = ex._get_credentials_dict()
        assert creds is None

    def test_polymarket_credentials_include_extras(self):
        ex = _create_exchange(
            Polymarket,
            api_key="ak",
            api_secret="as",
            passphrase="pp",
            private_key="pk",
            proxy_address="0xProxy",
        )
        creds = ex._get_credentials_dict()
        assert creds["apiKey"] == "ak"
        assert creds["apiSecret"] == "as"
        assert creds["passphrase"] == "pp"
        assert creds["privateKey"] == "pk"
        assert creds["funderAddress"] == "0xProxy"


# ---------------------------------------------------------------------------
# Exchange._handle_response tests
# ---------------------------------------------------------------------------

class TestHandleResponse:
    """Tests for the _handle_response method."""

    def test_success_returns_data(self):
        ex = _create_exchange()
        data = ex._handle_response({"success": True, "data": [1, 2, 3]})
        assert data == [1, 2, 3]

    def test_failure_raises_typed_error(self):
        ex = _create_exchange()
        with pytest.raises(MarketNotFound):
            ex._handle_response({
                "success": False,
                "error": {"message": "Market not found", "code": "MARKET_NOT_FOUND"},
            })

    def test_failure_generic_error(self):
        ex = _create_exchange()
        with pytest.raises(PmxtError):
            ex._handle_response({
                "success": False,
                "error": {"message": "unknown issue", "code": "UNKNOWN_ERROR"},
            })


# ---------------------------------------------------------------------------
# Exchange API method tests (mocking the HTTP layer)
# ---------------------------------------------------------------------------

class TestExchangeAPIMethods:
    """Tests for Exchange methods that hit the sidecar server."""

    def _setup_exchange_with_response(self, response_data: dict):
        """Return an exchange whose call_api always returns response_data."""
        ex = _create_exchange()
        mock_resp = _make_mock_response(response_data)
        ex._api_client.call_api = MagicMock(return_value=mock_resp)
        return ex

    # -- fetch_markets --

    def test_fetch_markets_returns_list(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "marketId": "m1",
                    "title": "Market A",
                    "outcomes": [{"outcomeId": "o1", "label": "Yes", "price": 0.7}],
                    "volume24h": 1000,
                    "liquidity": 5000,
                    "url": "https://example.com",
                },
            ],
        })
        markets = ex.fetch_markets()
        assert len(markets) == 1
        assert isinstance(markets[0], UnifiedMarket)
        assert markets[0].market_id == "m1"

    def test_fetch_markets_with_params(self):
        ex = self._setup_exchange_with_response({"success": True, "data": []})
        ex.fetch_markets(query="test")
        call_args = ex._api_client.call_api.call_args
        body = call_args.kwargs.get("body") or call_args[1].get("body")
        assert body["args"] == [{"query": "test"}]

    def test_fetch_markets_empty(self):
        ex = self._setup_exchange_with_response({"success": True, "data": []})
        result = ex.fetch_markets()
        assert result == []

    # -- fetch_market --

    def test_fetch_market_returns_single(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": {
                "marketId": "m1",
                "title": "Single",
                "outcomes": [],
                "volume24h": 0,
                "liquidity": 0,
                "url": "",
            },
        })
        m = ex.fetch_market(id="m1")
        assert isinstance(m, UnifiedMarket)
        assert m.market_id == "m1"

    # -- fetch_markets_paginated --

    def test_fetch_markets_paginated(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": {
                "data": [
                    {
                        "marketId": "mp1",
                        "title": "Paginated",
                        "outcomes": [],
                        "volume24h": 0,
                        "liquidity": 0,
                        "url": "",
                    },
                ],
                "total": 50,
                "nextCursor": "cursor-abc",
            },
        })
        result = ex.fetch_markets_paginated()
        assert isinstance(result, PaginatedMarketsResult)
        assert len(result.data) == 1
        assert result.total == 50
        assert result.next_cursor == "cursor-abc"

    # -- fetch_events --

    def test_fetch_events(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "id": "evt-1",
                    "title": "Election",
                    "description": "desc",
                    "slug": "election",
                    "markets": [],
                    "url": "",
                },
            ],
        })
        events = ex.fetch_events()
        assert len(events) == 1
        assert isinstance(events[0], UnifiedEvent)

    # -- fetch_event --

    def test_fetch_event(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": {
                "id": "evt-2",
                "title": "Single Event",
                "description": "d",
                "slug": "single",
                "markets": [],
                "url": "",
            },
        })
        e = ex.fetch_event(id="evt-2")
        assert isinstance(e, UnifiedEvent)
        assert e.id == "evt-2"

    # -- fetch_order_book --

    def test_fetch_order_book(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": {
                "bids": [{"price": 0.55, "size": 100}],
                "asks": [{"price": 0.57, "size": 80}],
                "timestamp": 170000,
            },
        })
        ob = ex.fetch_order_book("outcome-123")
        assert isinstance(ob, OrderBook)
        assert len(ob.bids) == 1
        assert ob.bids[0].price == 0.55

    # -- fetch_positions --

    def test_fetch_positions(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "marketId": "m1",
                    "outcomeId": "o1",
                    "outcomeLabel": "Yes",
                    "size": 50.0,
                    "entryPrice": 0.4,
                    "currentPrice": 0.6,
                    "unrealizedPnL": 10.0,
                },
            ],
        })
        positions = ex.fetch_positions()
        assert len(positions) == 1
        assert isinstance(positions[0], Position)

    # -- fetch_balance --

    def test_fetch_balance(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {"currency": "USDC", "total": 500.0, "available": 400.0, "locked": 100.0},
            ],
        })
        balances = ex.fetch_balance()
        assert len(balances) == 1
        assert isinstance(balances[0], Balance)
        assert balances[0].total == 500.0

    # -- fetch_open_orders --

    def test_fetch_open_orders(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "id": "ord-1",
                    "marketId": "m1",
                    "outcomeId": "o1",
                    "side": "buy",
                    "type": "limit",
                    "amount": 10.0,
                    "status": "open",
                    "filled": 0.0,
                    "remaining": 10.0,
                    "timestamp": 170000,
                    "price": 0.5,
                },
            ],
        })
        orders = ex.fetch_open_orders()
        assert len(orders) == 1
        assert isinstance(orders[0], Order)
        assert orders[0].status == "open"

    # -- cancel_order --

    def test_cancel_order(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": {
                "id": "ord-1",
                "marketId": "m1",
                "outcomeId": "o1",
                "side": "buy",
                "type": "limit",
                "amount": 10.0,
                "status": "cancelled",
                "filled": 0.0,
                "remaining": 10.0,
                "timestamp": 170000,
            },
        })
        order = ex.cancel_order("ord-1")
        assert isinstance(order, Order)
        assert order.status == "cancelled"

    # -- fetch_my_trades --

    def test_fetch_my_trades(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "id": "ut-1",
                    "timestamp": 170000,
                    "price": 0.5,
                    "amount": 10.0,
                    "side": "buy",
                    "orderId": "ord-5",
                },
            ],
        })
        trades = ex.fetch_my_trades()
        assert len(trades) == 1
        assert isinstance(trades[0], UserTrade)
        assert trades[0].order_id == "ord-5"

    # -- load_markets (caching) --

    def test_load_markets_caches(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "marketId": "m1",
                    "title": "Cached",
                    "outcomes": [],
                    "volume24h": 0,
                    "liquidity": 0,
                    "url": "",
                },
            ],
        })
        result1 = ex.load_markets()
        assert "m1" in result1

        # Second call should not hit the API again
        ex._api_client.call_api.reset_mock()
        result2 = ex.load_markets()
        ex._api_client.call_api.assert_not_called()
        assert result2 is result1

    def test_load_markets_reload(self):
        ex = self._setup_exchange_with_response({
            "success": True,
            "data": [
                {
                    "marketId": "m1",
                    "title": "Orig",
                    "outcomes": [],
                    "volume24h": 0,
                    "liquidity": 0,
                    "url": "",
                },
            ],
        })
        ex.load_markets()

        # Update mock response and reload
        new_resp = _make_mock_response({
            "success": True,
            "data": [
                {
                    "marketId": "m2",
                    "title": "New",
                    "outcomes": [],
                    "volume24h": 0,
                    "liquidity": 0,
                    "url": "",
                },
            ],
        })
        ex._api_client.call_api = MagicMock(return_value=new_resp)
        result = ex.load_markets(reload=True)
        assert "m2" in result
        assert "m1" not in result

    # -- close --

    def test_close(self):
        ex = self._setup_exchange_with_response({"success": True, "data": None})
        ex.close()  # should not raise
        ex._api_client.call_api.assert_called_once()

    # -- Error propagation --

    def test_api_error_raises_pmxt_error(self):
        """API methods catch all exceptions and re-wrap via _parse_api_exception.

        When the sidecar returns a failure response, _handle_response raises a
        typed PmxtError, but the generated method's broad except clause re-wraps
        it through _parse_api_exception.  The resulting error is still a PmxtError
        (possibly generic) carrying the original message.
        """
        ex = self._setup_exchange_with_response({
            "success": False,
            "error": {"message": "No such market", "code": "MARKET_NOT_FOUND"},
        })
        with pytest.raises(PmxtError, match="No such market"):
            ex.fetch_market(id="nonexistent")

    def test_api_exception_parsed(self):
        """When the HTTP layer raises ApiException, it's parsed into PmxtError."""
        from pmxt_internal.exceptions import ApiException

        ex = _create_exchange()
        api_exc = ApiException(status=400, reason="Bad Request")
        api_exc.body = json.dumps({
            "success": False,
            "error": {"message": "Invalid params", "code": "BAD_REQUEST"},
        })
        ex._api_client.call_api = MagicMock(side_effect=api_exc)
        with pytest.raises(BadRequest, match="Invalid params"):
            ex.fetch_markets()


# ---------------------------------------------------------------------------
# Exchange.call_api / _call_method tests
# ---------------------------------------------------------------------------

class TestLowLevelAPI:
    """Tests for call_api and _call_method."""

    def test_call_api_sends_operation_id(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({"success": True, "data": {"result": 42}})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        result = ex.call_api("getMarket", {"condition_id": "0xabc"})
        assert result == {"result": 42}

        call_args = ex._api_client.call_api.call_args
        body = call_args.kwargs.get("body") or call_args[1].get("body")
        assert body["args"] == ["getMarket", {"condition_id": "0xabc"}]

    def test_call_method_sends_params(self):
        ex = _create_exchange()
        mock_resp = _make_mock_response({"success": True, "data": "ok"})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        result = ex._call_method("customMethod", {"foo": "bar"})
        assert result == "ok"

    def test_call_api_includes_credentials(self):
        ex = _create_exchange(Kalshi, api_key="mykey")
        mock_resp = _make_mock_response({"success": True, "data": None})
        ex._api_client.call_api = MagicMock(return_value=mock_resp)

        ex.call_api("someOp")
        call_args = ex._api_client.call_api.call_args
        body = call_args.kwargs.get("body") or call_args[1].get("body")
        assert body["credentials"] == {"apiKey": "mykey"}


# ---------------------------------------------------------------------------
# Auth header tests
# ---------------------------------------------------------------------------

class TestAuthHeaders:
    """Tests for _get_auth_headers."""

    def test_auth_header_includes_access_token(self):
        ex = _create_exchange()
        headers = ex._get_auth_headers()
        assert headers.get("x-pmxt-access-token") == "test-token"

    def test_auth_header_no_token_when_no_server_info(self):
        ex = _create_exchange()
        ex._server_manager.get_server_info.return_value = None
        headers = ex._get_auth_headers()
        assert "x-pmxt-access-token" not in headers


