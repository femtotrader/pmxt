import pmxt

def main():
    api = pmxt.Polymarket()
    markets = api.get_markets_by_slug('who-will-trump-nominate-as-fed-chair')
    warsh = next((m for m in markets if m.outcomes[0].label == 'Kevin Warsh'), None)

    if warsh:
        # Note: in Python wrapper we use outcome.id which is already clobTokenId for Poly
        history = api.fetch_ohlcv(warsh.outcomes[0].id, pmxt.HistoryFilterParams(
            resolution='1h',
            limit=5
        ))
        print(history)
    else:
        print("Market not found")

if __name__ == "__main__":
    main()
