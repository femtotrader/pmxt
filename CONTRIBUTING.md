# Contributing to pmxt

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

## Workflow

1.  Make changes in `core/` (if updating the API).
2.  Update the OpenAPI spec if necessary.
3.  Run `npm run generate` to update the Python SDK.
4.  Test your changes using the examples in `sdks/python/examples`.

Thank you for helping us make prediction markets accessible to everyone!
