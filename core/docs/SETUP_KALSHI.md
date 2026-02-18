# Kalshi Setup Guide

To trade on Kalshi via the API you need two credentials: a **Key ID** (`apiKey`) and an **RSA private key** (`privateKey`). Public market data (prices, order books, etc.) does not require credentials.

---

## 1. Getting Your API Credentials

1. Log in to [Kalshi.com](https://kalshi.com) and open your **Account Settings**.
2. Go to the **API** tab and click **Create API Key**.
3. Give the key a name, choose the scopes you need (read-only or trading), and click **Generate**.
4. Copy the **Key ID** — this is your `KALSHI_API_KEY`.
5. Download or copy the **RSA Private Key** (PEM format) — this is your `KALSHI_PRIVATE_KEY`.

> **Tip:** Kalshi supports both file paths and raw PEM strings as the private key value.
> It is recommended to generate the key pair with at least 2048-bit RSA.

---

## 2. Choosing an Environment

Kalshi provides two independent environments:

| Environment | Base URL | Purpose |
|---|---|---|
| **Production** | `api.elections.kalshi.com` | Live trading with real money |
| **Demo** | `demo-api.elections.kalshi.com` | Safe paper-trading for testing |

The credentials for each environment are separate — generate them from the corresponding Kalshi dashboard (production or [demo](https://demo.kalshi.com)).

Switching environments is controlled by the `KALSHI_DEMO_MODE` environment variable or the `demoMode` / `demo_mode` constructor option:

| Setting | Value | Effect |
|---|---|---|
| `KALSHI_DEMO_MODE` | `true` | Use demo environment |
| `KALSHI_DEMO_MODE` | `false` *(default)* | Use production environment |

---

## 3. Environment Variables (`.env`)

```bash
# Kalshi
KALSHI_API_KEY=               # Key ID from the Kalshi API settings page
KALSHI_PRIVATE_KEY=           # RSA private key in PEM format (or file path)
KALSHI_DEMO_MODE=             # Set to `true` to use the demo environment (default: false)
```

---

## 4. Initialization (Python)

```python
import os
import pmxt

# ── Public data — no credentials needed ──────────────────────────────────────
kalshi = pmxt.Kalshi()
markets = kalshi.fetch_markets(query="Fed rates")

# ── Production trading ────────────────────────────────────────────────────────
kalshi = pmxt.Kalshi(
    api_key=os.getenv("KALSHI_API_KEY"),
    private_key=os.getenv("KALSHI_PRIVATE_KEY"),
)

balance = kalshi.fetch_balance()
print(f"Available: {balance[0].available}")

order = kalshi.create_order(
    market_id="FED-25JAN29-B4.75",
    side="buy",
    type="limit",
    price=0.55,
    amount=10,
)

# ── Demo / paper-trading environment ─────────────────────────────────────────
# Use demo credentials generated on demo.kalshi.com
kalshi_demo = pmxt.Kalshi(
    api_key=os.getenv("KALSHI_API_KEY"),       # demo API key
    private_key=os.getenv("KALSHI_PRIVATE_KEY"),
    demo_mode=True,
)

balance = kalshi_demo.fetch_balance()
```

*Alternatively, set `KALSHI_DEMO_MODE=true` in your `.env` file and omit the `demo_mode` argument.*

---

## 5. Initialization (TypeScript)

```typescript
import { KalshiExchange } from 'pmxt';

// ── Public data — no credentials needed ──────────────────────────────────────
const kalshi = new KalshiExchange();
const markets = await kalshi.fetchMarkets({ query: 'Fed rates' });

// ── Production trading ────────────────────────────────────────────────────────
const kalshi = new KalshiExchange({
  credentials: {
    apiKey: process.env.KALSHI_API_KEY,
    privateKey: process.env.KALSHI_PRIVATE_KEY,
  },
});

const balance = await kalshi.fetchBalance();
console.log(`Available: ${balance[0].available}`);

const order = await kalshi.createOrder({
  marketId: 'FED-25JAN29-B4.75',
  side: 'buy',
  type: 'limit',
  price: 0.55,
  amount: 10,
});

// ── Demo / paper-trading environment ─────────────────────────────────────────
// Use demo credentials generated on demo.kalshi.com
const kalshiDemo = new KalshiExchange({
  credentials: {
    apiKey: process.env.KALSHI_API_KEY,       // demo API key
    privateKey: process.env.KALSHI_PRIVATE_KEY,
  },
  demoMode: true,
});

const demoBalance = await kalshiDemo.fetchBalance();
```

*Alternatively, set `KALSHI_DEMO_MODE=true` in your `.env` file; the server picks this up automatically without needing `demoMode: true` in code.*

---

## 6. Security Best Practices

1. Store credentials in a `.env` file and add `.env` to `.gitignore` — never commit secrets.
2. Use separate API keys for development (demo) and production.
3. Grant only the minimum required scopes (read-only for market data scripts, trading only when needed).
4. Rotate keys periodically and revoke any that are no longer in use.
5. Keep your RSA private key file permissions restricted (`chmod 600 kalshi.pem`).
