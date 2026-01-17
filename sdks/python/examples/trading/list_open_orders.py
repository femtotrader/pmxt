import os
import pmxt

def main():
    client = pmxt.Polymarket(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))
    orders = client.fetch_open_orders()
    print(orders)

if __name__ == "__main__":
    main()
