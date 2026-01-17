import pmxt

def main():
    # Kalshi
    kalshi = pmxt.Kalshi()
    k_markets = kalshi.get_markets_by_slug('KXFEDCHAIRNOM-29')
    k_warsh = next((m for m in k_markets if m.outcomes[0].label == 'Kevin Warsh'), None)
    if k_warsh:
        k_trades = kalshi.fetch_trades(k_warsh.outcomes[0].id, pmxt.HistoryFilterParams(resolution='1h', limit=10))
        print('Kalshi:', k_trades)

    # Polymarket
    poly = pmxt.Polymarket()
    p_markets = poly.get_markets_by_slug('who-will-trump-nominate-as-fed-chair')
    p_warsh = next((m for m in p_markets if m.outcomes[0].label == 'Kevin Warsh'), None)
    if p_warsh:
        p_trades = poly.fetch_trades(p_warsh.outcomes[0].id, pmxt.HistoryFilterParams(resolution='1h', limit=10))
        print('Polymarket:', p_trades)

if __name__ == "__main__":
    main()
