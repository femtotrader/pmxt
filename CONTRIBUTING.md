# Contributing to pmxt

If you contribute, you'll get the Contributor rank on the Discord!

Welcome! We love contributors. This project is a monorepo setup to support multiple languages while keeping the core logic centralized.

## Repository Structure

- **[core](./core)**: The heart of the project. Contains the server implementation and the native Node.js library (`pmxt-core`).
- **[sdks/python](./sdks/python)**: The Python SDK. (Pip package `pmxt`).
- **[sdks/typescript](./sdks/typescript)**: The future home of the HTTP-based TypeScript/Node.js SDK (`pmxtjs`).

## Getting Started

### 1. Running the Server (Core)

The server is the backbone of the SDKs. To develop on it or run it locally:

```bash
# From the root
npm run server
```

Or navigating manually:

```bash
cd core
npm install
npm run server
```

### 2. Developing the Python SDK

See the [Python SDK Development Guide](./sdks/SDK_DEVELOPMENT.md) for detailed instructions on generating and testing the Python client.

## Development Workflow

This project uses a **Sidecar Architecture**: the core logic is in TypeScript (`core/`), which SDKs spawn as a background process.

### 1. Active Development (Auto-Restart)
To have the server automatically update when you change TypeScript code:

```bash
# In one terminal
cd core && npm run build -- --watch
```

The SDKs detect these changes via a version hash and will **auto-restart** the server on the next request.

### 2. Manual Forced Restart
If you need a guaranteed fresh server state:
```bash
export PMXT_ALWAYS_RESTART=1
# Run your SDK script
```

## Summary Workflow
1. Modify code in `core/src`.
2. Ensure `npm run build -- --watch` is running in the background.
3. Run your Python/TS scripts; the server will hot-swap automatically.

Thank you for helping us build the future of prediction markets!
