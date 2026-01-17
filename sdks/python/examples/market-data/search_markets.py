import pmxt

def main():
    poly = pmxt.Polymarket()
    kalshi = pmxt.Kalshi()

    print('Polymarket:', poly.search_markets('Trump'))
    print('Kalshi:', kalshi.search_markets('Trump'))

if __name__ == "__main__":
    main()
