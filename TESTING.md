# PMXT Testing Strategy

To ensure 100% certainty that all individual SDKs function correctly within the monorepo structure, we implement a **Unified Integration Test Pipeline**.

## The Challenge

In a monorepo with a shared backend (`core`) and multiple client SDKs (`sdks/python`, `sdks/typescript`), unit tests are insufficient. They only verify isolated logic. We need to verify the *communication* between the SDKs and the running Sidecar Server.

## The Solution: Matrix Integration Testing

We define a "Golden Path" of operations that every SDK must support (e.g., `Fetch Markets`, `Get Orderbook`). We then run these operations against a live local server.

### Workflow

1.  **Build Core**: Ensure the latest `core` server code is built.
2.  **Start Sidecar**: Launch the `pmxt` server in the background.
3.  **Run SDK Validation**:
    *   **TypeScript**: execute `sdks/typescript/examples/market-data/get_event_prices.ts`
    *   **Python**: execute `sdks/python/examples/market-data/get_event_prices.py`
4.  **Verify**: If all scripts exit with code `0`, the SDKs are correctly communicating with the server.

## How to Verify Locally

We have created a script to automate this:

```bash
./scripts/verify-all.sh
```

## Continuous Integration (CI)

This logic should be part of the CI pipeline (e.g., GitHub Actions). on every PR:
1.  Checkout code.
2.  Install dependencies.
3.  Run `./scripts/verify-all.sh`.
