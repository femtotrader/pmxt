"""
PMXT Python SDK - Quick Reference

Installation:
    pip install pmxt

Start Server:
    npm install -g pmxtjs
    pmxt-server

Basic Usage:
    import pmxt
    
    poly = pmxt.Polymarket()
    markets = poly.search_markets("Trump")
    
    outcome = markets[0].outcomes[0]
    candles = poly.fetch_ohlcv(
        outcome.id,
        pmxt.HistoryFilterParams(resolution="1d", limit=30)
    )

Authentication:
    # Polymarket
    poly = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY")
    )
    
    # Kalshi
    kalshi = pmxt.Kalshi(
        api_key=os.getenv("KALSHI_API_KEY"),
        private_key=os.getenv("KALSHI_PRIVATE_KEY")
    )

Market Data Methods:
    fetch_markets(params?)              # Get active markets
    search_markets(query, params?)      # Search by keyword
    get_markets_by_slug(slug)           # Get by URL slug/ticker
    fetch_ohlcv(outcome_id, params)     # Historical candles
    fetch_order_book(outcome_id)        # Current order book
    fetch_trades(outcome_id, params)    # Trade history

Trading Methods (require auth):
    create_order(params)                # Place order
    cancel_order(order_id)              # Cancel order
    fetch_order(order_id)               # Get order details
    fetch_open_orders(market_id?)       # Get open orders

Account Methods (require auth):
    fetch_balance()                     # Get balance
    fetch_positions()                   # Get positions

Important Notes:
    - Use outcome.id, not market.id for OHLCV/orderbook/trades
    - Prices are 0.0 to 1.0 (multiply by 100 for %)
    - Timestamps are Unix milliseconds
    - Server must be running on localhost:3847

Example - Complete Workflow:
    import pmxt
    
    # Initialize
    poly = pmxt.Polymarket(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))
    
    # Search
    markets = poly.search_markets("Trump")
    market = markets[0]
    outcome = market.outcomes[0]
    
    # Check balance
    balance = poly.fetch_balance()[0]
    print(f"Available: ${balance.available}")
    
    # Place order
    order = poly.create_order(pmxt.CreateOrderParams(
        market_id=market.id,
        outcome_id=outcome.id,
        side="buy",
        type="limit",
        amount=10,
        price=0.50
    ))
    
    # Check positions
    positions = poly.fetch_positions()
    for pos in positions:
        print(f"{pos.outcome_label}: ${pos.unrealized_pnl:.2f}")
"""
