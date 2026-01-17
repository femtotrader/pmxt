import pmxt

def main():
    api = pmxt.Kalshi()
    markets = api.get_markets_by_slug('KXFEDCHAIRNOM-29')
    warsh = next((m for m in markets if m.outcomes[0].label == 'Kevin Warsh'), None)

    if warsh:
        book = api.fetch_order_book(warsh.outcomes[0].id)
        print(book)
    else:
        print("Market not found")

if __name__ == "__main__":
    main()
