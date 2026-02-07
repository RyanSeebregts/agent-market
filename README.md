# FlareGate

**Escrow-based API Marketplace for AI Agents on Flare Network**

AI agents discover, pay for, and consume APIs autonomously using HTTP 402 responses, smart contract escrow on Flare's coston testnet, and two-party hash attestation to verify data delivery before releasing funds.

## Architecture

```
AI Agent  ──HTTP──>  FlareGate Gateway  ──Forward──>  Target API
   │        402+Price     │                 Response      │
   │       Data+Hash      │                               │
   │                      │
   │  confirmReceived()   │  confirmDelivery()
   ▼                      ▼
   ┌─────────────────────────────────────┐
   │   Escrow Smart Contract (coston)   │
   │   create → deliver → confirm/dispute│
   └─────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Testnet C2FLR from the [coston Faucet](https://faucet.flare.network/coston)

### Setup

```bash
# Install all dependencies, compile contracts, run tests
./setup.sh

# Fund the generated wallets with testnet C2FLR
# Addresses are printed by setup.sh

# Deploy the escrow contract to coston
npm run deploy

# Run the full demo (gateway + dashboard + agent)
./demo.sh
```

### Manual Steps

```bash
# Start the gateway (port 3000)
npm run gateway

# Start the dashboard (port 3001)
npm run dashboard

# Run the agent demo
npm run demo
```

## Project Structure

```
├── contracts/              # Solidity escrow contract + Hardhat
├── packages/
│   ├── shared/             # Types, errors, schemas, ABI (Effect-TS)
│   ├── gateway/            # Express proxy server (Effect-TS)
│   ├── agent/              # CLI demo agent (Effect-TS)
│   └── dashboard/          # Next.js monitoring dashboard
├── setup.sh                # One-command setup
└── demo.sh                 # One-command demo
```

## Tech Stack

- **Smart Contract**: Solidity 0.8.20, Hardhat, OpenZeppelin
- **Backend**: Effect-TS, Express, ethers.js v6
- **Frontend**: Next.js 14, Tailwind CSS
- **Network**: Flare coston Testnet (Chain ID: 16)

## How It Works

1. Agent requests an API through the gateway
2. Gateway returns **HTTP 402** with pricing info
3. Agent creates an **escrow** on-chain with the payment
4. Agent retries with the escrow ID
5. Gateway forwards the request, hashes the response, calls `confirmDelivery`
6. Agent verifies the hash matches and calls `confirmReceived`
7. If hashes match → funds released. If not → dispute raised.

## Contract Tests

```bash
npm run test:contracts
```

21 tests covering: happy path, hash mismatch disputes, timeout claims, refunds, access control, fee calculation, and pausable functionality.
