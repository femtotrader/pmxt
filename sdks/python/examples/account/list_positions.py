import os
import pmxt

def main():
    client = pmxt.Polymarket(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))
    print(client.fetch_positions())

if __name__ == "__main__":
    main()
