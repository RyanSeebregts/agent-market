# FlareGate: Exchange & API Flow — Complete System Explanation

## What Is the Platform?

FlareGate is an **escrow-based API marketplace** built on the Flare Network (Coston2 testnet). It lets AI agents autonomously discover, pay for, and consume APIs — without any human in the loop. The core innovation is using **HTTP 402 (Payment Required)** as the trigger mechanism for a blockchain-based escrow payment flow, combined with **two-party hash verification** to prove data was delivered correctly before funds are released.

The key question it answers: *How does an AI agent pay for an API call with no credit card, no API key, and no trust?*

---

## The Three Actors

1. **API Provider** — Registers their API on the marketplace with a wallet address and a price per endpoint.
2. **AI Agent** — Has a crypto wallet and wants to consume APIs autonomously.
3. **Gateway** — The FlareGate server. Acts as the **payment enforcer and proxy**. It sits between the agent and the actual API, blocks unpaid requests, and handles on-chain delivery confirmation.

There's also a **Smart Contract** on Flare Coston2 (`FlareGateEscrow.sol`) that holds funds in escrow and enforces the payment rules.

---

## How Do APIs List Themselves?

APIs are registered in a JSON registry file (`packages/gateway/data/registry.json`). Each listing contains:

- A unique ID (e.g. `"weather-api"`)
- A human-readable name and description
- The provider's Ethereum wallet address (where they get paid)
- A base URL pointing to the actual API server
- A list of endpoints with their paths, HTTP methods, and **price in wei**

Currently three demo APIs are pre-seeded:

| API | Endpoint | Price |
|-----|----------|-------|
| Weather API | `/weather?city=London` | 0.1 C2FLR |
| Joke API | `/joke?category=programming` | 0.05 C2FLR |
| Price Feed API | `/price?symbol=FLR` | 0.075 C2FLR |

New APIs can also be registered dynamically via `POST /api/register`. There's no approval process — any provider can list.

---

## Is the System a Proxy?

**Yes, but a selective one.** The gateway does not blindly forward all requests. It acts as a **payment-gated reverse proxy**:

- **No payment proof?** The gateway returns HTTP 402 and never touches the real API.
- **Valid escrow proof?** The gateway forwards the request to the real API's `baseUrl + path`, captures the response, hashes it, commits the hash on-chain, and returns the data to the agent.

The gateway never stores the data long-term. It is a pass-through that enforces payment and performs the cryptographic delivery attestation on behalf of the API provider.

---

## How Does Someone Pay an API?

Payment happens through an **on-chain escrow contract**. Nobody sends money directly to the API provider. Instead:

1. The agent deposits funds into the smart contract, locked to a specific provider and endpoint.
2. The contract holds the money until both parties (gateway-as-provider and agent) submit matching hashes proving the data was delivered correctly.
3. Only then does the contract release 99% to the provider and 1% to FlareGate as a platform fee.

Two payment methods are supported:
- **Native C2FLR** — sent as `msg.value` in `createEscrow()`
- **ERC-20 tokens** (e.g. FXRP) — agent approves the contract, then calls `createEscrowWithToken()`

---

## Who Makes the Escrow?

**The AI agent creates the escrow.** The agent's wallet calls `createEscrow()` on the smart contract, depositing the required funds. The agent decides the provider address, endpoint, timeout, and payment amount based on the 402 response from the gateway.

The gateway does **not** create escrows. It only:
1. Tells the agent what to pay (via the 402 response)
2. Verifies the escrow exists and is funded (when the agent retries)
3. Calls `confirmDelivery()` after forwarding the API response

---

## The Full Flow, Step by Step

Here's every step that happens when an AI agent wants to call the Weather API:

### Step 1: Discovery

```
Agent → GET /api/catalog → Gateway
Gateway → 200 OK { apis: [...], contractAddress: "0x..." }
```

The agent browses the catalog to see what APIs are available and how much they cost.

### Step 2: Initial Request (Gets Rejected)

```
Agent → GET /api/proxy/weather-api/weather?city=London → Gateway
```

The gateway sees **no `X-Escrow-Id` header**, so it does NOT forward the request to the actual API. Instead it returns:

```json
{
  "error": "Payment Required",
  "price": "100000000000000000",
  "currency": "C2FLR",
  "provider": "0xABC...",
  "endpoint": "/weather",
  "contractAddress": "0xDEF...",
  "chainId": 114,
  "instructions": "Create escrow with createEscrow(provider, endpoint, timeout)...",
  "acceptedTokens": [
    { "symbol": "FXRP", "address": "0x...", "priceUnits": "100000" }
  ]
}
```

This 402 response is the payment invoice. It tells the agent everything it needs: how much, to whom, on which contract, on which chain.

### Step 3: Agent Creates Escrow On-Chain

The agent's wallet sends a transaction to the Flare blockchain:

```solidity
FlareGateEscrow.createEscrow(
  provider: "0xABC...",
  endpoint: "/weather",
  timeout: 300              // 5 minutes
)
{ value: 100000000000000000 }  // 0.1 C2FLR attached
```

The contract:
- Stores a new `Escrow` struct with state = `Created`
- Locks the 0.1 C2FLR inside the contract
- Assigns an escrow ID (auto-incrementing)
- Emits `EscrowCreated` event
- Returns `escrowId` (e.g. `1`)

At this point, the money is locked. Neither the agent nor the provider can touch it yet.

### Step 4: Agent Retries with Payment Proof

```
Agent → GET /api/proxy/weather-api/weather?city=London
        Header: X-Escrow-Id: 1
→ Gateway
```

The gateway now sees the escrow ID and runs verification:

1. **Calls `getEscrow(1)` on-chain** — reads the escrow struct
2. **Checks state** — must be `Created` (not already delivered/completed)
3. **Checks amount** — escrow amount must be >= the endpoint's price
4. **Checks token** — if it's an ERC-20 escrow, scales the price to match token decimals

All checks pass.

### Step 5: Gateway Forwards to the Real API

```
Gateway → GET http://localhost:3000/mock/weather?city=London → Target API
Target API → 200 OK { "city": "London", "temp": 12, "condition": "Cloudy", ... }
```

The gateway captures the **raw response body as a string**.

### Step 6: Gateway Hashes and Confirms Delivery On-Chain

```
dataHash = keccak256(toUtf8Bytes(responseBody))    // e.g. 0xAB12...
```

The gateway (acting as the provider's delegate) sends a transaction:

```solidity
FlareGateEscrow.confirmDelivery(escrowId: 1, dataHash: 0xAB12...)
```

The contract:
- Stores `deliveryHash = 0xAB12...`
- Changes state from `Created` → `Delivered`
- Records `deliveredAt` timestamp
- Emits `DeliveryConfirmed` event

### Step 7: Gateway Returns Data to Agent

```
← 200 OK
Headers: X-Data-Hash: 0xAB12..., X-Escrow-Id: 1
Body: { "city": "London", "temp": 12, "condition": "Cloudy", ... }
```

The agent now has the data **and** the hash that was committed on-chain.

### Step 8: Agent Independently Hashes and Verifies

The agent hashes the raw response body it received using the exact same function:

```
localHash = keccak256(toUtf8Bytes(responseBody))    // e.g. 0xAB12...
```

It compares `localHash` vs the `X-Data-Hash` header. They should match — meaning the gateway didn't tamper with the data between hashing it on-chain and sending it to the agent.

### Step 9: Agent Confirms Receipt On-Chain

The agent sends a transaction:

```solidity
FlareGateEscrow.confirmReceived(escrowId: 1, receiptHash: 0xAB12...)
```

The contract compares `receiptHash` against the stored `deliveryHash`:

**If hashes match (happy path):**
- State → `Completed`
- `_releaseFunds()` is called:
  - 99% (0.099 C2FLR) → provider's wallet
  - 1% (0.001 C2FLR) → FlareGate's fee recipient
- Emits `FundsReleased` event

**If hashes don't match (data was tampered with):**
- State → `Disputed`
- Funds stay locked in the contract
- Emits `DisputeRaised` event with both hashes for investigation

---

## Sequence Diagram

```
AGENT                          GATEWAY                    ESCROW CONTRACT       TARGET API
  │                               │                              │                  │
  ├──────── GET /catalog ────────→│                              │                  │
  │←─ [Weather 0.1 FLR, ...] ────┤                              │                  │
  │                               │                              │                  │
  ├─ GET /proxy/weather/... ─────→│                              │                  │
  │←─ 402 Payment Required ───────┤                              │                  │
  │   {price, provider, contract}  │                              │                  │
  │                               │                              │                  │
  │                               │   createEscrow()             │                  │
  │───────────────────────────────┼── (value=0.1 FLR) ─────────→│                  │
  │                               │←── EscrowCreated, id=#1 ─────┤                  │
  │                               │                              │                  │
  │ GET /proxy/weather/...        │                              │                  │
  │ X-Escrow-Id: 1 ──────────────→│                              │                  │
  │                               ├── Verify escrow on-chain ───→│                  │
  │                               │←── { state: Created, ... } ──┤                  │
  │                               │                              │                  │
  │                               ├── Forward to API ────────────────────────────→│
  │                               │←── { city: "London", temp: 12, ... } ────────┤
  │                               │                              │                  │
  │                               ├── confirmDelivery(1, hash) ─→│                  │
  │                               │←── DeliveryConfirmed ────────┤                  │
  │←─ 200 OK + X-Data-Hash ──────┤                              │                  │
  │                               │                              │                  │
  │ Hash locally (same result)    │                              │                  │
  │                               │                              │                  │
  │── confirmReceived(1, hash) ───┼─────────────────────────────→│                  │
  │                               │                              │ compare hashes   │
  │                               │←── FundsReleased ────────────┤                  │
  │←─ { hashesMatch: true } ──────┤   provider += 0.099 FLR     │                  │
  │                               │   platform += 0.001 FLR     │                  │
```

---

## Edge Cases and Safety Nets

| Scenario | What Happens |
|----------|-------------|
| **Provider never delivers** (agent times out) | After `timeout` seconds from creation, agent calls `refund()` → full refund, state = `Refunded` |
| **Agent never confirms** (goes offline) | After `timeout` seconds from delivery, provider calls `claimTimeout()` → funds released to provider, state = `Claimed` |
| **Hash mismatch** (data tampered) | State = `Disputed`, funds stay locked, both hashes recorded on-chain for evidence |
| **Insufficient escrow amount** | Gateway returns 400 before forwarding to the API |
| **Escrow already used** | Gateway returns 400 ("not in Created state") |
| **Contract paused** (emergency) | Owner can pause all operations via `pause()` |
| **Reentrancy attack** | Protected by OpenZeppelin `ReentrancyGuard` on all fund-releasing functions |

---

## Why the Hash Mechanism Matters

The two-party hash comparison is the trust mechanism that eliminates the need for any centralized authority:

- **The provider can't lie** — their hash is committed on-chain before the agent even receives the data.
- **The gateway can't tamper** — the agent independently hashes what it received and compares.
- **The agent can't claim it didn't get data** — if it did, the hashes will match. If it submits a fake hash, the contract flags a dispute (the provider already committed the real hash).
- **No data is stored on-chain** — only 32-byte keccak256 hashes. The actual response data stays off-chain.

---

## Authentication Model

There are **no API keys, no usernames, no passwords**. Identity is purely wallet-based:

- Agent = the wallet that called `createEscrow()`
- Provider = the wallet address in the API listing
- Gateway = has its own wallet for signing `confirmDelivery()` transactions

Access control is enforced at the smart contract level: only the agent can confirm receipt, only the provider can confirm delivery, only the owner can pause/unpause.

---

## Architecture Summary

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│   AI Agent   │ ──402──→│     Gateway      │         │  Target API  │
│  (has wallet)│ ←price──│ (proxy + payment │         │  (real data) │
│              │         │   enforcer)      │         │              │
│              │ ──retry──│                  │──fwd───→│              │
│              │ +escrow  │                  │←resp────│              │
│              │ ←data────│                  │         └──────────────┘
└──────┬───────┘         └────────┬─────────┘
       │                          │
       │ createEscrow()           │ confirmDelivery()
       │ confirmReceived()        │
       │                          │
       └──────────┬───────────────┘
                  ▼
       ┌──────────────────┐
       │  Escrow Contract │
       │  (Flare Coston2) │
       │                  │
       │  Holds funds     │
       │  Compares hashes │
       │  Releases 99/1%  │
       └──────────────────┘
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `contracts/FlareGateEscrow.sol` | Core escrow logic, state transitions, fund release |
| `packages/shared/src/types.ts` | Domain models (Escrow, ApiListing, PaymentInfo) |
| `packages/shared/src/errors.ts` | Tagged error types |
| `packages/shared/src/services.ts` | Service interface definitions |
| `packages/shared/src/contract.ts` | ABI + hash function |
| `packages/gateway/src/routes/proxy.ts` | HTTP 402 flow, escrow verification, API forwarding |
| `packages/gateway/src/routes/catalog.ts` | Catalog endpoint serving the registry |
| `packages/gateway/data/registry.json` | Pre-seeded API listings |
| `packages/agent/src/sdk.ts` | `agentFetch()` and `agentFetchWithToken()` pipelines |
| `packages/agent/src/demo.ts` | Interactive CLI demo |
