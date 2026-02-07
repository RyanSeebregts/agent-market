# FlareGate: API Marketplace for AI Agents on Flare Network

## Project Overview

Build a working demo of an escrow-based API marketplace where AI agents can discover, pay for, and consume APIs autonomously. The system uses HTTP 402 responses to trigger payments, smart contract escrow on Flare's testnet (coston), and a two-party hash attestation model to verify data delivery before releasing funds.

**This is a hackathon project.** Prioritize a working end-to-end demo over production robustness. Everything should be runnable locally with a single setup script.

## Programming Paradigm: Effect-TS

**All TypeScript code (gateway, agent, shared) MUST use the Effect library (`effect` npm package) for effectful programming.** This is a hard requirement.

### Why Effect

This project involves composing many fallible async operations: blockchain calls, HTTP proxying, hash verification, contract event watching. Effect gives us typed errors, composable pipelines, retries, timeouts, and structured concurrency — all of which are core to this domain.

### Effect Conventions to Follow

1. **All fallible operations return `Effect.Effect<A, E, R>`** — never throw, never use try/catch
2. **Define tagged error types** for each failure mode:
   ```typescript
   import { Data, Effect } from "effect"

   class EscrowNotFound extends Data.TaggedError("EscrowNotFound")<{
     escrowId: number
   }> {}

   class InsufficientFunds extends Data.TaggedError("InsufficientFunds")<{
     required: bigint
     available: bigint
   }> {}

   class HashMismatch extends Data.TaggedError("HashMismatch")<{
     expected: string
     received: string
   }> {}

   class ContractCallFailed extends Data.TaggedError("ContractCallFailed")<{
     method: string
     reason: string
   }> {}

   class PaymentRequired extends Data.TaggedError("PaymentRequired")<{
     price: string
     provider: string
     endpoint: string
     contractAddress: string
   }> {}

   class ApiCallFailed extends Data.TaggedError("ApiCallFailed")<{
     url: string
     status: number
     body: string
   }> {}

   class TimeoutExpired extends Data.TaggedError("TimeoutExpired")<{
     escrowId: number
   }> {}
   ```

3. **Use services (Context/Layer) for dependencies:**
   ```typescript
   import { Context, Layer, Effect } from "effect"

   // Define service interfaces
   class EscrowContract extends Context.Tag("EscrowContract")<
     EscrowContract,
     {
       createEscrow: (params: CreateEscrowParams) => Effect.Effect<number, ContractCallFailed>
       confirmDelivery: (escrowId: number, hash: string) => Effect.Effect<void, ContractCallFailed | EscrowNotFound>
       confirmReceived: (escrowId: number, hash: string) => Effect.Effect<boolean, ContractCallFailed | EscrowNotFound>
       getEscrow: (escrowId: number) => Effect.Effect<Escrow, EscrowNotFound>
     }
   >() {}

   class ApiRegistry extends Context.Tag("ApiRegistry")<
     ApiRegistry,
     {
       getAll: () => Effect.Effect<ApiListing[]>
       getById: (id: string) => Effect.Effect<ApiListing, ApiNotFound>
       register: (listing: ApiListing) => Effect.Effect<ApiListing>
     }
   >() {}

   class GatewayWallet extends Context.Tag("GatewayWallet")<
     GatewayWallet,
     {
       address: string
       signAndSend: (tx: TransactionRequest) => Effect.Effect<TransactionReceipt, ContractCallFailed>
     }
   >() {}
   ```

4. **Compose with pipe and generators:**
   ```typescript
   // Use Effect.gen for sequential flows
   const processApiCall = (escrowId: number, listingId: string, path: string) =>
     Effect.gen(function* () {
       const registry = yield* ApiRegistry
       const contract = yield* EscrowContract

       const listing = yield* registry.getById(listingId)
       const escrow = yield* contract.getEscrow(escrowId)

       // Forward to API
       const response = yield* forwardRequest(listing, path)
       const dataHash = hashResponseData(response.body)

       // Confirm delivery on-chain
       yield* contract.confirmDelivery(escrowId, dataHash)

       return { data: response.body, dataHash }
     })
   ```

5. **Use Effect.retry, Effect.timeout, Effect.catchTag for control flow:**
   ```typescript
   // Retry contract calls with exponential backoff
   const withRetry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
     effect.pipe(
       Effect.retry({ times: 3, schedule: Schedule.exponential("1 second") })
     )

   // Timeout for escrow operations
   const withTimeout = <A, E, R>(effect: Effect.Effect<A, E, R>, duration: string) =>
     effect.pipe(Effect.timeout(duration))

   // Handle specific errors
   const handled = processApiCall(1, "weather", "/current").pipe(
     Effect.catchTag("EscrowNotFound", (e) =>
       Effect.succeed({ error: `Escrow ${e.escrowId} not found` })
     ),
     Effect.catchTag("InsufficientFunds", (e) =>
       Effect.succeed({ error: `Need ${e.required}, have ${e.available}` })
     )
   )
   ```

6. **Run effects at the edge (entry points only):**
   ```typescript
   // In Express route handlers, run the effect
   import { NodeRuntime } from "@effect/platform-node"

   app.get("/api/proxy/:listingId/*", async (req, res) => {
     const program = handleProxyRequest(req).pipe(
       Effect.provide(LiveLayer) // provide all service implementations
     )
     const result = await Effect.runPromise(program)
     res.status(result.status).json(result.body)
   })

   // Or for the CLI demo
   const main = agentDemo.pipe(Effect.provide(LiveLayer))
   NodeRuntime.runMain(main)
   ```

7. **Use `@effect/platform` for HTTP where it makes sense:**
   - The gateway HTTP server can use Express (simpler for hackathon) BUT wrap all handler logic in Effect
   - HTTP client calls (agent → gateway, gateway → mock APIs) should use `@effect/platform` HttpClient
   - This is a pragmatic balance — don't fight Express for routing, but keep all business logic in Effect

### Effect Packages to Use

```json
{
  "effect": "^3.x",
  "@effect/platform": "^0.x",
  "@effect/platform-node": "^0.x",
  "@effect/schema": "^0.x"
}
```

Use `@effect/schema` for runtime validation of API responses, escrow data, and request payloads. Define schemas that match the contract structs.

---

## Architecture

```
┌─────────────┐     HTTP Request      ┌──────────────────┐     Forward Request     ┌─────────────┐
│             │ ───────────────────►   │                  │ ──────────────────────►  │             │
│  AI Agent   │     402 + Price        │  FlareGate       │     API Response         │  Target API │
│  (Client)   │ ◄───────────────────   │  Gateway/Proxy   │ ◄──────────────────────  │  (Provider) │
│             │     Data Response      │                  │                          │             │
│             │ ◄───────────────────   │                  │                          │             │
└──────┬──────┘                        └────────┬─────────┘                          └─────────────┘
       │                                        │
       │  confirmReceived(id, hash)              │  confirmDelivery(id, hash)
       │                                        │
       ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Escrow Smart Contract (coston)                  │
│                                                                      │
│  createEscrow() → confirmDelivery(hash) → confirmReceived(hash)     │
│                     hashes match? → release funds                    │
│                     timeout? → provider can claim                    │
│                     hash mismatch? → dispute                         │
└──────────────────────────────────────────────────────────────────────┘
```

**No frontend.** This is a backend-only project with a CLI demo. A frontend can be added later.

---

## Components to Build

### 1. Smart Contract (`contracts/FlareGateEscrow.sol`)

**Language:** Solidity ^0.8.19
**Network:** Flare Coston2 Testnet (Chain ID: 114, RPC: https://coston2-api.flare.network/ext/C/rpc)
**Framework:** Hardhat

#### Data Structures

```solidity
enum EscrowState { Created, Delivered, Completed, Disputed, Refunded, Claimed }

struct Escrow {
    uint256 id;
    address agent;           // the AI agent's wallet
    address provider;        // the API provider's wallet
    uint256 amount;          // payment amount in wei (native C2FLR) or token units
    string endpoint;         // API endpoint identifier (e.g., "/weather/current")
    bytes32 deliveryHash;    // keccak256 of response data, set by gateway
    bytes32 receiptHash;     // keccak256 of received data, set by agent
    EscrowState state;
    uint256 createdAt;
    uint256 deliveredAt;
    uint256 timeout;         // seconds before provider can auto-claim
}
```

#### Functions

```solidity
// Agent creates escrow and deposits funds (payable with native token)
function createEscrow(
    address _provider,
    string calldata _endpoint,
    uint256 _timeout           // e.g., 300 = 5 minutes
) external payable returns (uint256 escrowId);

// Gateway/provider confirms delivery and submits hash of the response data
function confirmDelivery(
    uint256 _escrowId,
    bytes32 _dataHash
) external;
// Requirements: caller == provider, state == Created
// Effects: state → Delivered, sets deliveryHash, sets deliveredAt

// Agent confirms receipt and submits hash of what they received
function confirmReceived(
    uint256 _escrowId,
    bytes32 _dataHash
) external;
// Requirements: caller == agent, state == Delivered
// Effects:
//   if _dataHash == deliveryHash → state → Completed, transfer funds to provider
//   if _dataHash != deliveryHash → state → Disputed

// Provider claims funds after timeout (agent ghosted)
function claimTimeout(uint256 _escrowId) external;
// Requirements: caller == provider, state == Delivered,
//               block.timestamp > deliveredAt + timeout
// Effects: state → Claimed, transfer funds to provider

// Agent can request refund if provider never delivers
function refund(uint256 _escrowId) external;
// Requirements: caller == agent, state == Created,
//               block.timestamp > createdAt + timeout
// Effects: state → Refunded, transfer funds back to agent

// View function to get escrow details
function getEscrow(uint256 _escrowId) external view returns (Escrow memory);

// View function to get all escrows for an agent or provider
function getEscrowsByAgent(address _agent) external view returns (uint256[] memory);
function getEscrowsByProvider(address _provider) external view returns (uint256[] memory);
```

#### Events

```solidity
event EscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, string endpoint);
event DeliveryConfirmed(uint256 indexed escrowId, bytes32 dataHash);
event ReceiptConfirmed(uint256 indexed escrowId, bytes32 dataHash, bool hashesMatch);
event FundsReleased(uint256 indexed escrowId, address indexed provider, uint256 amount);
event DisputeRaised(uint256 indexed escrowId, bytes32 deliveryHash, bytes32 receiptHash);
event TimeoutClaimed(uint256 indexed escrowId);
event Refunded(uint256 indexed escrowId);
```

#### Additional Notes

- Take a 1% platform fee on successful completions (send to a configurable `feeRecipient` address)
- Use native C2FLR token for payments (simplifies the demo — no ERC20 approval flows)
- Include a simple `pause()` / `unpause()` for emergencies (use OpenZeppelin's Pausable)
- Keep the timeout reasonably short for demo purposes (default 5 minutes)

---

### 2. Gateway / Proxy Server (`packages/gateway/`)

**Framework:** Express.js (simpler than Next.js for this use case)
**Port:** 3000

This is the core product — a proxy that sits between AI agents and API providers.

#### API Provider Registry

Store in a local JSON file or SQLite for the demo. Each registered API has:

```typescript
interface ApiListing {
  id: string;                    // uuid
  name: string;                  // "Weather API"
  description: string;           // "Get current weather for any city"
  providerAddress: string;       // Ethereum address of the provider
  baseUrl: string;               // "https://api.openweathermap.org/data/2.5"
  endpoints: {
    path: string;                // "/weather"
    method: string;              // "GET"
    priceWei: string;            // price in wei per call
    description: string;         // "Get current weather by city"
  }[];
}
```

For the demo, pre-seed 2-3 mock APIs (see Mock APIs section below).

#### Gateway Endpoints

```
GET /api/catalog
  → Returns list of all available APIs and their pricing

GET/POST /api/proxy/:listingId/*
  → Main proxy endpoint. Flow:
    1. Look up the API listing
    2. Check if request includes a valid escrow ID header (X-Escrow-Id)
    3. If NO escrow ID:
       → Return 402 with JSON body:
         {
           "error": "Payment Required",
           "price": "1000000000000000",  // in wei
           "currency": "C2FLR",
           "provider": "0x...",
           "endpoint": "/weather",
           "contractAddress": "0x...",
           "chainId": 114,
           "instructions": "Create escrow with createEscrow(provider, endpoint, timeout) and retry with X-Escrow-Id header"
         }
    4. If escrow ID provided:
       a. Verify escrow exists on-chain, state == Created, agent matches, amount sufficient
       b. Forward request to the actual API (or mock API)
       c. Get response data
       d. Hash the response: keccak256(responseBody)
       e. Call confirmDelivery(escrowId, hash) on the contract
       f. Return the API response to the agent with header X-Data-Hash: 0x...
       g. Agent can now verify and call confirmReceived()

POST /api/register
  → Register a new API (for demo/admin use)
  → Body: ApiListing object

GET /api/escrows/:address
  → Get all escrows for an address (convenience endpoint wrapping contract calls)
```

#### Gateway Wallet

The gateway needs its own wallet to call `confirmDelivery` on the contract. For the demo:
- Generate a wallet at startup if one doesn't exist
- Store the private key in a `.env` file
- Fund it with testnet C2FLR from the coston faucet
- The gateway acts as the provider's delegate for the hash submission

**Important:** For the demo, the gateway submits the delivery hash on behalf of the provider. In production, you'd want the provider to do this themselves or have a more sophisticated delegation model.

---

### 3. Mock APIs (`packages/gateway/src/mocks/`)

Build 2-3 simple mock APIs that run locally so the demo doesn't depend on external services.

#### Mock API 1: Weather API
```
GET /mock/weather?city=London
→ Returns: { "city": "London", "temp": 12, "condition": "Cloudy", "humidity": 65, "timestamp": "..." }
```
Randomly generate plausible weather data for any city.

#### Mock API 2: Joke API
```
GET /mock/joke?category=programming
→ Returns: { "joke": "Why do programmers prefer dark mode? Because light attracts bugs.", "category": "programming" }
```
Return from a small hardcoded list of jokes.

#### Mock API 3: Price Feed API
```
GET /mock/price?symbol=FLR
→ Returns: { "symbol": "FLR", "price": 0.025, "change24h": 2.5, "volume": 1500000, "timestamp": "..." }
```
Return mock crypto price data.

---

### 4. Agent SDK / Demo Client (`packages/agent/`)

**Language:** TypeScript
**Framework:** Simple CLI script using ethers.js v6

Build a demo script that simulates an AI agent consuming an API through the marketplace.

#### Core Function

```typescript
import { Effect, Schedule, Console } from "effect"
import { EscrowContract, ApiRegistry, AgentWallet } from "@flaregate/shared"

// The main function an AI agent would use — pure Effect pipeline
const agentFetch = (
  gatewayUrl: string,
  listingId: string,
  path: string,
  options?: {
    maxPriceWei?: bigint
    timeout?: number
  }
) =>
  Effect.gen(function* () {
    const wallet = yield* AgentWallet
    const contract = yield* EscrowContract

    // 1. Make initial request to gateway
    const initialResponse = yield* httpGet(`${gatewayUrl}/api/proxy/${listingId}${path}`)

    // 2. If not 402, something unexpected
    if (initialResponse.status !== 402) {
      return yield* Effect.fail(new ApiCallFailed({
        url: path, status: initialResponse.status, body: initialResponse.body
      }))
    }

    // 3. Parse payment requirements
    const paymentInfo = yield* Schema.decodeUnknown(PaymentRequiredSchema)(
      JSON.parse(initialResponse.body)
    )

    // 4. Check price against max
    if (options?.maxPriceWei && BigInt(paymentInfo.price) > options.maxPriceWei) {
      return yield* Effect.fail(new InsufficientFunds({
        required: BigInt(paymentInfo.price),
        available: options.maxPriceWei
      }))
    }

    // 5. Create escrow on-chain
    yield* Console.log("💰 Creating escrow and depositing funds...")
    const escrowId = yield* contract.createEscrow({
      provider: paymentInfo.provider,
      endpoint: paymentInfo.endpoint,
      timeout: options?.timeout ?? 300,
      value: BigInt(paymentInfo.price)
    })
    yield* Console.log(`✅ Escrow #${escrowId} created`)

    // 6. Retry request with escrow ID
    yield* Console.log("📡 Retrying API call with payment proof...")
    const dataResponse = yield* httpGet(
      `${gatewayUrl}/api/proxy/${listingId}${path}`,
      { "X-Escrow-Id": String(escrowId) }
    )

    // 7. Hash received data
    const localHash = hashResponseData(dataResponse.body)
    const gatewayHash = dataResponse.headers["x-data-hash"]
    yield* Console.log(`🔐 Local hash:   ${localHash}`)
    yield* Console.log(`🔐 Gateway hash: ${gatewayHash}`)

    // 8. Confirm receipt on-chain
    yield* Console.log("📝 Confirming receipt on-chain...")
    const hashesMatch = yield* contract.confirmReceived(escrowId, localHash)

    if (hashesMatch) {
      yield* Console.log("✅ Hashes match — funds released to provider!")
    } else {
      yield* Console.log("❌ Hash mismatch — dispute raised!")
    }

    return {
      data: JSON.parse(dataResponse.body),
      escrowId,
      dataHash: localHash,
      hashesMatch
    }
  })
```

#### Demo Script (`packages/agent/src/demo.ts`)

```typescript
import { Effect, Console, Duration } from "effect"
import { NodeRuntime } from "@effect/platform-node"

const demo = Effect.gen(function* () {
  yield* Console.log("🤖 FlareGate Agent Demo")
  yield* Console.log("========================\n")

  const wallet = yield* AgentWallet
  yield* Console.log(`Agent wallet: ${wallet.address}`)

  const balance = yield* wallet.getBalance()
  yield* Console.log(`Balance: ${formatEther(balance)} C2FLR\n`)

  // Step 1: Browse catalog
  yield* Console.log("📚 Step 1: Browsing API catalog...")
  const catalog = yield* getCatalog("http://localhost:3000")
  // Display available APIs with prices

  // Step 2: Try without payment (get 402)
  yield* Console.log("\n🔒 Step 2: Attempting API call without payment...")
  // Show the 402 response

  // Step 3-6: Full agentFetch flow
  yield* Console.log("\n💰 Step 3: Paying and consuming API...")
  const result = yield* agentFetch(
    "http://localhost:3000",
    "weather-api",
    "/weather?city=London",
    { maxPriceWei: BigInt("1000000000000000000") } // 1 C2FLR max
  )

  yield* Console.log(`\n📊 Data received: ${JSON.stringify(result.data, null, 2)}`)
  yield* Console.log(`\n🎉 Demo complete! Escrow #${result.escrowId} settled on-chain.`)
})

// Compose layers and run
const LiveLayer = Layer.mergeAll(
  AgentWalletLive,
  EscrowContractLive,
)

const main = demo.pipe(
  Effect.provide(LiveLayer),
  Effect.catchAll((error) =>
    Console.error(`\n❌ Demo failed: ${error._tag} — ${JSON.stringify(error)}`)
  )
)

NodeRuntime.runMain(main)
```

**Make the console output colorful and clear** — use chalk alongside Effect Console. Each step should print what's happening, show transaction hashes, hashes being compared, etc. Add small delays between steps (`yield* Effect.sleep(Duration.seconds(1))`) so the audience can follow along.

---

### 5. Dashboard (`packages/dashboard/`)

**Framework:** Next.js 14 (App Router) with Tailwind CSS + shadcn/ui
**Port:** 3001

A minimal frontend to visualize the marketplace and escrow lifecycle. This is a **read-only companion** to the CLI demo — it doesn't initiate any transactions, it just shows what's happening.

#### Design Direction

- Dark background (#0a0a0a or similar), Flare coral (#E62058) as accent
- Flat, colorful, pastel status badges — not corporate
- Quirky touches: animated dots for "pending" states, subtle pulse on new events
- shadcn/ui components for cards, badges, tables
- Transaction hashes link to coston explorer (`https://coston2-explorer.flare.network/tx/{hash}`)
- Keep it to 3 pages max

#### Pages

**`/` — Home / Catalog**
- Grid of API cards showing: name, description, price per call (in C2FLR), endpoint count
- Contract info bar at top: contract address (linked to explorer), network badge ("coston Testnet")
- Simple stats: total escrows created, total value settled, active escrows

**`/escrows` — Escrow Explorer**
- Search bar: paste an escrow ID or wallet address
- Results show EscrowCard components with:
  - State badge (color-coded): Created (yellow/amber), Delivered (blue), Completed (green), Disputed (red), Claimed (orange), Refunded (gray)
  - Agent address, provider address (truncated with copy button)
  - Amount in C2FLR
  - Delivery hash and receipt hash (show match/mismatch visually)
  - Timestamps: created, delivered, completed
  - Link to transaction on explorer

**`/live` — Live Event Feed**
- Real-time feed of contract events, polling every 5 seconds (or use ethers.js contract event listeners)
- Events displayed as a scrolling list, newest at top:
  - 🆕 EscrowCreated — "Escrow #4 created by 0xAB...cd for /weather — 0.1 C2FLR"
  - 📦 DeliveryConfirmed — "Escrow #4 delivery confirmed — hash: 0x1a2b..."
  - ✅ ReceiptConfirmed — "Escrow #4 receipt confirmed — hashes match!"
  - 💰 FundsReleased — "Escrow #4 — 0.099 C2FLR released to provider"
  - ❌ DisputeRaised — "Escrow #5 — hash mismatch!"
- **This is the demo page** — show it on screen while running the CLI agent demo

#### Data Fetching

The dashboard reads data from two sources:

1. **Gateway API** — `GET /api/catalog` for API listings, `GET /api/escrows/:address` for escrow queries
2. **Direct contract reads** — use ethers.js with the coston public RPC (read-only, no wallet needed) for escrow state and event listening

```typescript
// lib/contract.ts — client-side read-only contract
import { Contract, JsonRpcProvider } from "ethers"
import { ESCROW_ABI, ESCROW_ADDRESS } from "@flaregate/shared"

const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL)
const contract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, provider)

export const getEscrow = (id: number) => contract.getEscrow(id)
export const listenForEvents = (callback: (event: any) => void) => {
  contract.on("EscrowCreated", callback)
  contract.on("DeliveryConfirmed", callback)
  contract.on("ReceiptConfirmed", callback)
  contract.on("FundsReleased", callback)
  contract.on("DisputeRaised", callback)
}
```

#### Environment Variables (dashboard)

```bash
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
NEXT_PUBLIC_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_EXPLORER_URL=https://coston2-explorer.flare.network
```

#### Notes for Claude Code

- **No Effect-TS in the dashboard** — it's a standard Next.js app. Effect is for the backend/agent only.
- Use `"use client"` for the live event feed and escrow explorer (they need browser-side ethers.js)
- The catalog page can be a server component fetching from the gateway
- Don't over-build this — 3 pages, shadcn/ui, done. It's eye candy for the demo.

---

---

## Project Structure

This is a **TypeScript monorepo** using npm workspaces. Shared types, errors, and contract bindings live in a shared package.

```
flaregate/
├── package.json                    # Root workspace config
├── tsconfig.base.json              # Shared TS config
│
├── contracts/
│   ├── FlareGateEscrow.sol
│   ├── hardhat.config.ts
│   ├── scripts/
│   │   └── deploy.ts
│   ├── test/
│   │   └── FlareGateEscrow.test.ts
│   └── package.json
│
├── packages/
│   ├── shared/                     # Shared types, errors, schemas, contract ABI
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── errors.ts          # All tagged error types
│   │   │   ├── schemas.ts         # @effect/schema definitions
│   │   │   ├── services.ts        # Service interfaces (Context.Tag)
│   │   │   ├── types.ts           # Domain types (Escrow, ApiListing, etc.)
│   │   │   └── contract.ts        # ABI + typed contract helpers
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── index.ts           # Express server entry, Effect layer composition
│   │   │   ├── routes/
│   │   │   │   ├── catalog.ts     # GET /api/catalog
│   │   │   │   ├── proxy.ts      # GET/POST /api/proxy/:listingId/* (core 402 flow)
│   │   │   │   ├── register.ts   # POST /api/register
│   │   │   │   └── escrows.ts    # GET /api/escrows/:address
│   │   │   ├── mocks/
│   │   │   │   ├── weather.ts
│   │   │   │   ├── jokes.ts
│   │   │   │   └── prices.ts
│   │   │   ├── services/
│   │   │   │   ├── escrow.ts     # EscrowContract service implementation (Live layer)
│   │   │   │   ├── registry.ts   # ApiRegistry service implementation (JSON-backed)
│   │   │   │   └── wallet.ts     # GatewayWallet service implementation
│   │   │   └── layers.ts         # Compose all live layers for the gateway
│   │   ├── data/
│   │   │   └── registry.json     # Pre-seeded API listings
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── agent/
│       ├── src/
│       │   ├── sdk.ts             # agentFetch() — the core Effect pipeline
│       │   ├── demo.ts            # Interactive CLI demo (entry point)
│       │   ├── services/
│       │   │   ├── escrow.ts      # Agent's EscrowContract layer
│       │   │   └── wallet.ts      # Agent wallet layer
│       │   └── layers.ts          # Compose all live layers for the agent
│       ├── package.json
│       └── tsconfig.json
│
│   └── dashboard/                  # Minimal Next.js frontend
│       ├── app/
│       │   ├── layout.tsx         # Root layout with Flare branding
│       │   ├── page.tsx           # Home — API catalog + escrow overview
│       │   ├── escrows/
│       │   │   └── page.tsx       # Escrow explorer — search by ID or address
│       │   └── live/
│       │       └── page.tsx       # Live event feed from contract
│       ├── components/
│       │   ├── EscrowCard.tsx     # Single escrow state display
│       │   ├── EventFeed.tsx      # Real-time contract events
│       │   ├── ApiCard.tsx        # API listing card
│       │   └── StatusBadge.tsx    # Color-coded escrow state badge
│       ├── lib/
│       │   ├── contract.ts        # Client-side contract read helpers (ethers + public provider)
│       │   └── gateway.ts         # Fetch helpers for gateway API
│       ├── package.json
│       ├── tailwind.config.ts
│       └── next.config.js
│
├── .env.example
├── setup.sh
├── demo.sh
└── README.md
```

### Workspace Config (`package.json` root)

```json
{
  "name": "flaregate",
  "private": true,
  "workspaces": [
    "packages/*",
    "contracts"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "build:contracts": "cd contracts && npx hardhat compile",
    "deploy": "cd contracts && npx hardhat run scripts/deploy.ts --network coston2",
    "gateway": "npm run start --workspace=packages/gateway",
    "dashboard": "npm run dev --workspace=packages/dashboard",
    "demo": "npm run demo --workspace=packages/agent",
    "test:contracts": "cd contracts && npx hardhat test"
  }
}
```

---

## Environment Variables (`.env`)

```bash
# Network
RPC_URL=https://coston2-api.flare.network/ext/C/rpc
CHAIN_ID=114
EXPLORER_URL=https://coston2-explorer.flare.network

# Contract (filled after deployment)
ESCROW_CONTRACT_ADDRESS=

# Gateway
GATEWAY_PORT=3000
GATEWAY_PRIVATE_KEY=          # Gateway's wallet private key

# Agent (for demo)
AGENT_PRIVATE_KEY=            # Demo agent's wallet private key

# Dashboard
DASHBOARD_PORT=3001
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
NEXT_PUBLIC_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=
NEXT_PUBLIC_EXPLORER_URL=https://coston2-explorer.flare.network

# Platform fee recipient
FEE_RECIPIENT=                # Address to receive platform fees
```

---

## Setup & Demo Scripts

### `setup.sh`

```bash
#!/bin/bash
# 1. Install all workspace dependencies (npm install from root)
# 2. Build shared package first
# 3. Compile contracts
# 4. Run contract tests
# 5. Deploy to coston (requires funded deployer wallet)
# 6. Update .env with contract address
# 7. Build gateway and agent packages
# 8. Seed the API registry with mock APIs
# 9. Print setup summary with wallet addresses and faucet link
```

### `demo.sh`

```bash
#!/bin/bash
# 1. Start the gateway server (background)
# 2. Start the dashboard dev server (background)
# 3. Wait for both to be ready (health checks)
# 4. Open dashboard /live page in browser
# 5. Run the agent demo script
# 6. Kill gateway and dashboard on exit
```

---

## Testing

### Contract Tests (`contracts/test/`)

Write Hardhat tests covering:

1. **Happy path**: createEscrow → confirmDelivery → confirmReceived (matching hashes) → funds released
2. **Hash mismatch**: delivery and receipt hashes don't match → dispute state
3. **Timeout claim**: provider claims after agent doesn't confirm within timeout
4. **Refund**: agent refunds when provider never delivers
5. **Access control**: only agent can confirm receipt, only provider can confirm delivery
6. **Fee calculation**: verify 1% fee is deducted and sent to feeRecipient
7. **Edge cases**: zero amount, same address as agent and provider, double confirmation

### Integration Test

A simple script that runs the full flow locally:
1. Deploy contract to Hardhat local network
2. Start gateway pointing at local network
3. Run agent demo against local gateway
4. Assert all escrow states are correct

---

## Key Implementation Details

### Hash Generation

Both the gateway and agent must hash the response data identically. This function lives in `packages/shared`:

```typescript
import { keccak256, toUtf8Bytes } from "ethers"

// Pure function — no Effect needed, it's synchronous and infallible
export const hashResponseData = (responseBody: string): string =>
  keccak256(toUtf8Bytes(responseBody))
```

**Critical:** The gateway must hash the EXACT bytes it sends to the agent. The agent must hash the EXACT bytes it receives. No pretty-printing, no re-serialization. Use the raw response body string.

### Contract Interaction (Effect-wrapped)

All contract calls go through the `EscrowContract` service. The Live implementation in each package wraps ethers.js:

```typescript
import { Effect, Layer } from "effect"
import { Contract, Wallet, JsonRpcProvider } from "ethers"
import { EscrowContract, ContractCallFailed } from "@flaregate/shared"

export const EscrowContractLive = Layer.succeed(
  EscrowContract,
  {
    createEscrow: (params) =>
      Effect.tryPromise({
        try: async () => {
          const tx = await contract.createEscrow(
            params.provider,
            params.endpoint,
            params.timeout,
            { value: params.value }
          )
          const receipt = await tx.wait()
          // Parse EscrowCreated event to get escrowId
          const event = receipt.logs.find(/* ... */)
          return Number(event.args.escrowId)
        },
        catch: (error) => new ContractCallFailed({
          method: "createEscrow",
          reason: String(error)
        })
      }),

    confirmDelivery: (escrowId, hash) =>
      Effect.tryPromise({
        try: async () => {
          const tx = await contract.confirmDelivery(escrowId, hash)
          await tx.wait()
        },
        catch: (error) => new ContractCallFailed({
          method: "confirmDelivery",
          reason: String(error)
        })
      }),

    confirmReceived: (escrowId, hash) =>
      Effect.tryPromise({
        try: async () => {
          const tx = await contract.confirmReceived(escrowId, hash)
          const receipt = await tx.wait()
          // Check ReceiptConfirmed event for hashesMatch
          const event = receipt.logs.find(/* ... */)
          return event.args.hashesMatch
        },
        catch: (error) => new ContractCallFailed({
          method: "confirmReceived",
          reason: String(error)
        })
      }),

    getEscrow: (escrowId) =>
      Effect.tryPromise({
        try: () => contract.getEscrow(escrowId),
        catch: () => new EscrowNotFound({ escrowId })
      })
  }
)
```

### Error Handling

For the demo, keep error handling simple but informative:
- If the agent doesn't have enough C2FLR, print a clear message with the faucet URL
- If the contract call fails, print the revert reason
- If the gateway can't reach the mock API, return a clear error

---

## Demo Flow (What to Show at Hackathon)

1. **Open the dashboard** (`/live` page) on a big screen or second monitor
2. **Run the agent demo** in a terminal next to it
3. Show the terminal output step-by-step:
   - Agent browses the catalog
   - Agent tries to call API → gets 402
   - Agent pays into escrow → tx hash appears in terminal AND on dashboard live feed
   - Agent retries → gets data
   - Agent verifies hash → confirms on-chain → payment released
   - Dashboard shows the full lifecycle in real-time alongside the CLI
4. **Show the escrow explorer** — search by the escrow ID from the demo, show both hashes matching
5. **Show the contract on coston explorer** — all transactions visible on-chain
6. **Talk about the architecture** — Effect-TS for typed error handling, hash attestation for trustless verification

### Stretch Goals (if time permits)

1. **ERC-20 stablecoin support** — deploy a mock USDC and add token payment option
2. **Multiple API calls in sequence** — agent chains weather → price → joke using Effect pipe
3. **Dispute demo** — show what happens when hashes don't match (tampered data)
4. **Agent auto-discovery** — agent searches catalog for APIs matching a natural language query
5. **Flare FTSO integration** — use Flare's price oracle to show FLR/USD conversion in the dashboard

---

## Dependencies Summary

### Contracts
- hardhat, @nomicfoundation/hardhat-toolbox
- @openzeppelin/contracts (Pausable, ReentrancyGuard)
- ethers v6 (bundled with hardhat)

### Shared (`packages/shared`)
- effect
- @effect/schema
- ethers v6

### Gateway (`packages/gateway`)
- effect, @effect/platform, @effect/platform-node
- express, cors, @types/express
- ethers v6
- uuid
- dotenv
- @flaregate/shared (workspace dependency)

### Agent (`packages/agent`)
- effect, @effect/platform, @effect/platform-node
- ethers v6
- chalk (for colorful console output)
- dotenv
- @flaregate/shared (workspace dependency)

### Dashboard (`packages/dashboard`)
- next 14, react 18, react-dom 18
- tailwindcss, @tailwindcss/postcss
- shadcn/ui (install components: card, badge, table, input, button)
- ethers v6 (client-side contract reads + event listening)
- @flaregate/shared (workspace dependency — for ABI and contract address)

---

## Important Notes for Claude Code

1. **All TypeScript code MUST use Effect-TS.** No try/catch, no thrown errors, no raw Promises in business logic. Only run Effects at entry points.
2. **Start with the contract.** Get it deployed and tested first. Everything depends on it.
3. **Then build `packages/shared`** — define all error types, service interfaces, and schemas here first. Gateway and agent both depend on this.
4. **Use coston testnet** — not Coston (that's Songbird's testnet). Chain ID 114.
5. **The gateway is the middleman** — it acts on behalf of the provider for hash submission in this demo.
6. **Raw bytes matter** — the hash comparison only works if both sides hash identical bytes. Don't JSON.stringify differently on each side. Hash the raw response body string.
7. **Make the demo script theatrical** — add delays, emojis, colored output with chalk. This is a hackathon presentation.
8. **Dashboard is eye candy** — build it last, keep it to 3 pages. No Effect-TS in the dashboard, just standard Next.js with client components for event listening.
9. **The 402 status code is the hook** — emphasize this in the demo. HTTP 402 was literally designed for this use case and has been unused for 25+ years.
10. **Faucet for C2FLR**: https://faucet.flare.network/coston — the setup script should remind users to fund their wallets.
11. **Use `@effect/schema` for all external data validation** — request payloads, contract return values, API responses.
12. **Service layers should be composable** — the gateway and agent each compose their own `LiveLayer` from shared service definitions.
13. **Express is fine for HTTP routing** — don't try to replace Express with Effect's HTTP server. Just wrap handler logic in Effect and run it with `Effect.runPromise` in the route handler.
