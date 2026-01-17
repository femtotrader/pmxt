import os
import pmxt

def main():
    client = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY") # Must start with '0x'
    )
    print("Polymarket client initialized")

if __name__ == "__main__":
    main()
