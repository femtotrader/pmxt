import pmxt

def main():
    poly = pmxt.Polymarket()
    kalshi = pmxt.Kalshi()

    print('Polymarket:', poly.search_markets('Fed Chair'))
    print('Kalshi:', kalshi.search_markets('Fed Chair'))

if __name__ == "__main__":
    main()
