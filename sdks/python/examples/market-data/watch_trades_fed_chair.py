import pmxt
import json
import urllib.request
from datetime import datetime
import time

def run():
    api = pmxt.Polymarket()
    
    # Search for the Rick Rieder market
    print("Searching for Rick Rieder market...")
    markets = api.search_markets("Rick Rieder")
    market = next((m for m in markets if "Rick Rieder" in m.title and "Fed" in m.title), None)
    
    if not market:
        print("Market not found")
        return
    
    outcome = market.outcomes[0]  # YES outcome
    asset_id = outcome.id

    print(f"Watching trades for: {market.title}")
    print(f"Outcome: {outcome.label} (Asset ID: {asset_id})\n")

    while True:
        try:
            trades = api.watch_trades(asset_id)
            for trade in trades:
                side_str = trade.side.upper().rjust(4)
                amount_str = f"{trade.amount:10,.0f}"
                price_str = f"${trade.price:.3f}"
                time_str = datetime.fromtimestamp(trade.timestamp / 1000).strftime('%H:%M:%S')
                
                print(f"[TRADE] {side_str} | {amount_str} shares @ {price_str} | {time_str}")
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    run()
