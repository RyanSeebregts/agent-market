"use client";

import { useReducer, useCallback, useState } from "react";
import { keccak256, toUtf8Bytes } from "ethers";
import { StepCard } from "@/components/demo/StepCard";
import type { StepStatus } from "@/components/demo/StepCard";
import { Play, RotateCcw, Coins, CircleDollarSign } from "lucide-react";

// Gateway URL and explorer come from NEXT_PUBLIC_ env vars injected by next.config.js.
// LISTING_ID and QUERY_PATH target the pre-registered Weather API in the gateway registry.
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3000";
const LISTING_ID = "weather-api";
const QUERY_PATH = "/weather?city=London";
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://coston2-explorer.flare.network";

// "native" pays with C2FLR (the chain's native token).
// "token" pays with FXRP (an ERC-20 FAssets token on Coston2).
type PaymentMethod = "native" | "token";

/* ─── State ─── */

// Each of the 6 demo steps has a status (pending/active/success/error)
// and a data bag of key-value pairs displayed inside the StepCard.
interface StepState {
  status: StepStatus;
  data: Record<string, string>;
}

// Top-level state: a `running` flag to disable the Start button,
// plus a fixed-length tuple of 6 step states (one per card).
interface DemoState {
  running: boolean;
  steps: [StepState, StepState, StepState, StepState, StepState, StepState];
}

// Reducer actions:
//   START        — reset all steps and set running=true
//   STEP_ACTIVE  — show the spinner on a specific step card
//   STEP_SUCCESS — mark a step green and merge in its display data
//   STEP_ERROR   — mark a step red, merge error info, and stop the demo
//   RESET        — return to the initial blank state
type Action =
  | { type: "START" }
  | { type: "STEP_ACTIVE"; step: number }
  | { type: "STEP_SUCCESS"; step: number; data?: Record<string, string> }
  | { type: "STEP_ERROR"; step: number; data?: Record<string, string> }
  | { type: "RESET" };

// Factory for a blank step — pending with no data.
const emptyStep = (): StepState => ({ status: "pending", data: {} });

// All 6 steps start as pending (invisible) until the demo begins.
const initialState: DemoState = {
  running: false,
  steps: [emptyStep(), emptyStep(), emptyStep(), emptyStep(), emptyStep(), emptyStep()],
};

// Immutably updates the steps tuple. STEP_ERROR also sets running=false
// so the user can click Start again or Reset.
function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "START":
      return { ...initialState, running: true };
    case "STEP_ACTIVE": {
      const steps = [...state.steps] as DemoState["steps"];
      steps[action.step] = { ...steps[action.step], status: "active" };
      return { ...state, steps };
    }
    case "STEP_SUCCESS": {
      const steps = [...state.steps] as DemoState["steps"];
      steps[action.step] = {
        status: "success",
        data: { ...steps[action.step].data, ...action.data },
      };
      return { ...state, steps };
    }
    case "STEP_ERROR": {
      const steps = [...state.steps] as DemoState["steps"];
      steps[action.step] = {
        status: "error",
        data: { ...steps[action.step].data, ...action.data },
      };
      return { ...state, running: false, steps };
    }
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

/* ─── Helpers ─── */

// Small pause between steps so each card animates in visibly
// rather than all appearing at once.
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─── Component ─── */

export default function DemoPage() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Tracks which payment method the user selected before clicking Start.
  // Locked while a demo is running so it can't change mid-flow.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("native");

  // runDemo executes the full 6-step escrow flow sequentially.
  // Each step dispatches STEP_ACTIVE (shows spinner), does its work,
  // then dispatches STEP_SUCCESS or STEP_ERROR before moving on.
  // The `method` parameter determines whether Step 2 calls the native
  // or token escrow route handler.
  const runDemo = useCallback(async (method: PaymentMethod) => {
    dispatch({ type: "START" });

    try {
      // ────────────────────────────────────────────────────────────
      // Step 0 — Initial Request
      // The agent makes a plain GET request to the gateway proxy
      // WITHOUT any payment headers. The gateway checks the registry,
      // sees the endpoint has a price, and returns HTTP 402.
      // ────────────────────────────────────────────────────────────
      dispatch({ type: "STEP_ACTIVE", step: 0 });
      await delay(600);

      const initialResp = await fetch(
        `${GATEWAY_URL}/api/proxy/${LISTING_ID}${QUERY_PATH}`
      );
      const initialBody = await initialResp.text();

      // If the gateway didn't return 402, something is wrong
      // (gateway not running, listing missing, etc.)
      if (initialResp.status !== 402) {
        dispatch({
          type: "STEP_ERROR",
          step: 0,
          data: { Status: String(initialResp.status), Body: initialBody.slice(0, 200) },
        });
        return;
      }

      dispatch({
        type: "STEP_SUCCESS",
        step: 0,
        data: {
          Endpoint: `GET /api/proxy/${LISTING_ID}${QUERY_PATH}`,
          Status: "402 Payment Required",
        },
      });

      // ────────────────────────────────────────────────────────────
      // Step 1 — Payment Required
      // Parse the 402 response body which contains the PaymentInfo:
      // price (in wei), provider address, contract address, endpoint.
      // For token payments the body also includes an acceptedTokens
      // array with the FXRP address and its scaled price.
      // ────────────────────────────────────────────────────────────
      dispatch({ type: "STEP_ACTIVE", step: 1 });
      await delay(400);

      const paymentInfo = JSON.parse(initialBody);

      // Build the data fields shown in the card depending on
      // which payment method was selected.
      const step1Data: Record<string, string> = {
        Provider: paymentInfo.provider,
        Contract: paymentInfo.contractAddress,
        Endpoint: paymentInfo.endpoint,
      };

      if (method === "token") {
        // Find the FXRP entry in the acceptedTokens array.
        // The gateway includes this when FXRP_TOKEN_ADDRESS is set.
        const tokenInfo = paymentInfo.acceptedTokens?.[0];
        if (!tokenInfo) {
          dispatch({
            type: "STEP_ERROR",
            step: 1,
            data: { Error: "Gateway did not return acceptedTokens — is FXRP_TOKEN_ADDRESS set in .env?" },
          });
          return;
        }
        step1Data["Price"] = `${tokenInfo.priceUnits} ${tokenInfo.symbol}`;
        step1Data["Token"] = tokenInfo.address;
      } else {
        step1Data["Price"] = `${paymentInfo.price} wei (${paymentInfo.currency})`;
      }

      dispatch({ type: "STEP_SUCCESS", step: 1, data: step1Data });

      // ────────────────────────────────────────────────────────────
      // Step 2 — Create Escrow
      // Branches based on payment method:
      //
      // Native (C2FLR):
      //   POST /api/demo/create-escrow → createEscrow() on-chain
      //   Sends native value with the transaction.
      //
      // Token (FXRP):
      //   POST /api/demo/create-escrow-token → approve() + createEscrowWithToken()
      //   First approves the escrow contract to spend the ERC-20,
      //   then creates the escrow which transfers tokens into the contract.
      // ────────────────────────────────────────────────────────────
      dispatch({ type: "STEP_ACTIVE", step: 2 });

      let escrowId: number;
      let createTxHash: string;
      let agent: string;
      let depositLabel: string;

      if (method === "token") {
        // Token flow — approve + createEscrowWithToken via server route
        const tokenInfo = paymentInfo.acceptedTokens[0];
        const escrowResp = await fetch("/api/demo/create-escrow-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: paymentInfo.provider,
            endpoint: paymentInfo.endpoint,
            timeout: 300,
            tokenAddress: tokenInfo.address,
            amount: tokenInfo.priceUnits,
          }),
        });

        if (!escrowResp.ok) {
          const err = await escrowResp.json();
          dispatch({ type: "STEP_ERROR", step: 2, data: { Error: err.error } });
          return;
        }

        const result = await escrowResp.json();
        escrowId = result.escrowId;
        createTxHash = result.txHash;
        agent = result.agent;
        depositLabel = `${tokenInfo.priceUnits} ${tokenInfo.symbol}`;
      } else {
        // Native flow — createEscrow with C2FLR value
        const escrowResp = await fetch("/api/demo/create-escrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: paymentInfo.provider,
            endpoint: paymentInfo.endpoint,
            timeout: 300,
            valueWei: paymentInfo.price,
          }),
        });

        if (!escrowResp.ok) {
          const err = await escrowResp.json();
          dispatch({ type: "STEP_ERROR", step: 2, data: { Error: err.error } });
          return;
        }

        const result = await escrowResp.json();
        escrowId = result.escrowId;
        createTxHash = result.txHash;
        agent = result.agent;
        depositLabel = `${paymentInfo.price} wei (C2FLR)`;
      }

      dispatch({
        type: "STEP_SUCCESS",
        step: 2,
        data: {
          "Escrow ID": String(escrowId),
          "Tx Hash": createTxHash,
          Agent: agent,
          Deposited: depositLabel,
          "Payment Method": method === "token" ? "FXRP (ERC-20)" : "C2FLR (Native)",
        },
      });

      // ────────────────────────────────────────────────────────────
      // Step 3 — API Delivery
      // The agent retries the same gateway endpoint, this time
      // including the X-Escrow-Id header as payment proof. The
      // gateway verifies the escrow on-chain (works for both native
      // and token escrows), forwards the request to the backend API,
      // hashes the response (confirmDelivery), and returns the data
      // plus an X-Data-Hash header.
      // ────────────────────────────────────────────────────────────
      dispatch({ type: "STEP_ACTIVE", step: 3 });
      await delay(400);

      const dataResp = await fetch(
        `${GATEWAY_URL}/api/proxy/${LISTING_ID}${QUERY_PATH}`,
        { headers: { "X-Escrow-Id": String(escrowId) } }
      );
      const dataBody = await dataResp.text();

      if (dataResp.status !== 200) {
        dispatch({
          type: "STEP_ERROR",
          step: 3,
          data: { Status: String(dataResp.status), Body: dataBody.slice(0, 200) },
        });
        return;
      }

      // The gateway's X-Data-Hash header contains the keccak256 hash
      // it committed on-chain via confirmDelivery().
      const gatewayHash = dataResp.headers.get("x-data-hash") || "unknown";
      const parsed = JSON.parse(dataBody);
      dispatch({
        type: "STEP_SUCCESS",
        step: 3,
        data: {
          Status: "200 OK",
          City: parsed.city,
          Temperature: `${parsed.temp}°C`,
          Condition: parsed.condition,
          "Gateway Hash": gatewayHash,
        },
      });

      // ────────────────────────────────────────────────────────────
      // Step 4 — Verify & Settle
      // The agent independently hashes the received response body
      // using the same keccak256(toUtf8Bytes()) algorithm. Then it
      // calls confirmReceived() on-chain via the Route Handler.
      // The contract compares the agent's hash with the gateway's
      // delivery hash. If they match → funds are released to the
      // provider. If not → a dispute is raised.
      // This step is identical for native and token escrows — the
      // contract handles both transparently.
      // ────────────────────────────────────────────────────────────
      dispatch({ type: "STEP_ACTIVE", step: 4 });

      // Hash the raw response body client-side — same algorithm as
      // hashResponseData() in @flaregate/shared.
      const localHash = keccak256(toUtf8Bytes(dataBody));

      const confirmResp = await fetch("/api/demo/confirm-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrowId, dataHash: localHash }),
      });

      if (!confirmResp.ok) {
        const err = await confirmResp.json();
        dispatch({ type: "STEP_ERROR", step: 4, data: { Error: err.error } });
        return;
      }

      const { txHash: confirmTxHash, hashesMatch, fundsReleased } = await confirmResp.json();
      dispatch({
        type: "STEP_SUCCESS",
        step: 4,
        data: {
          "Local Hash": localHash,
          "Gateway Hash": gatewayHash,
          "Hashes Match": hashesMatch ? "Yes" : "No",
          "Funds Released": fundsReleased ? "Yes" : "No",
          "Tx Hash": confirmTxHash,
        },
      });

      // ────────────────────────────────────────────────────────────
      // Step 5 — Complete Summary
      // No network calls — just collects the key results from all
      // previous steps into a single summary card: escrow ID,
      // weather data received, payment method used, hash match
      // outcome, and both tx hashes so the audience can verify
      // on the block explorer.
      // ────────────────────────────────────────────────────────────
      dispatch({ type: "STEP_ACTIVE", step: 5 });
      await delay(300);

      dispatch({
        type: "STEP_SUCCESS",
        step: 5,
        data: {
          "Escrow ID": String(escrowId),
          "Payment Method": method === "token" ? "FXRP (ERC-20)" : "C2FLR (Native)",
          "Weather Data": `${parsed.city}: ${parsed.temp}°C, ${parsed.condition}`,
          "Hashes Matched": hashesMatch ? "Yes — funds released to provider" : "No — dispute raised",
          "Create Tx": createTxHash,
          "Settle Tx": confirmTxHash,
        },
      });
    } catch (err: any) {
      console.error("Demo failed:", err);
    }
  }, []);

  // Configuration for each step card's static display properties:
  // title, sender/receiver actors (determines which Lucide icons show),
  // and left-border accent color.
  const STEP_CONFIG = [
    {
      title: "Initial Request",          // Agent sends unauthenticated request
      sender: "agent" as const,
      receiver: "gateway" as const,
      accent: "#3b82f6",                 // blue
    },
    {
      title: "Payment Required",         // Gateway responds with 402 + payment info
      sender: "gateway" as const,
      receiver: "agent" as const,
      accent: "#f59e0b",                 // amber
    },
    {
      title: "Create Escrow",            // Agent deposits funds on-chain
      sender: "agent" as const,
      receiver: "blockchain" as const,
      accent: "#f97316",                 // orange
    },
    {
      title: "API Delivery",             // Gateway delivers data after verifying escrow
      sender: "gateway" as const,
      receiver: "agent" as const,
      accent: "#10b981",                 // emerald
    },
    {
      title: "Verify & Settle",          // Agent hashes data and settles on-chain
      sender: "agent" as const,
      receiver: "blockchain" as const,
      accent: "#22c55e",                 // green
    },
    {
      title: "Complete",                 // Summary of the entire flow
      sender: "agent" as const,
      receiver: "blockchain" as const,
      accent: "#a855f7",                 // purple
    },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header with title and description */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Live Escrow Demo</h2>
        <p className="text-gray-400">
          Watch the full payment flow: request, escrow, delivery, verification, and settlement — all on-chain.
        </p>
      </div>

      {/* Payment method toggle — lets the user pick between native C2FLR
          and FXRP token payment before starting. Disabled while running. */}
      <div className="mb-5">
        <label className="text-sm text-gray-400 block mb-2">Payment method</label>
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentMethod("native")}
            disabled={state.running}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
              paymentMethod === "native"
                ? "border-flare-coral bg-flare-coral/10 text-white"
                : "border-flare-border text-gray-400 hover:text-white hover:border-gray-500"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Coins className="w-4 h-4" />
            C2FLR (Native)
          </button>
          <button
            onClick={() => setPaymentMethod("token")}
            disabled={state.running}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
              paymentMethod === "token"
                ? "border-flare-coral bg-flare-coral/10 text-white"
                : "border-flare-border text-gray-400 hover:text-white hover:border-gray-500"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <CircleDollarSign className="w-4 h-4" />
            FXRP (ERC-20)
          </button>
        </div>
      </div>

      {/* Start / Reset controls — Start is disabled while running,
          Reset only appears after the demo has finished or errored */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => runDemo(paymentMethod)}
          disabled={state.running}
          className="flex items-center gap-2 px-5 py-2.5 bg-flare-coral text-white text-sm font-medium rounded-lg hover:bg-flare-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-4 h-4" />
          {state.running ? "Running..." : "Start Demo"}
        </button>
        {!state.running && state.steps.some((s) => s.status !== "pending") && (
          <button
            onClick={() => dispatch({ type: "RESET" })}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-flare-border rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        )}
      </div>

      {/* Step Cards — each card is hidden (returns null) while its status
          is "pending". As the demo progresses, cards animate in via
          the slideIn Tailwind animation. Data fields with hashes, tx hashes,
          or addresses get monospace styling for readability. */}
      <div className="space-y-4">
        {STEP_CONFIG.map((cfg, i) => (
          <StepCard
            key={i}
            stepNumber={i + 1}
            title={cfg.title}
            sender={cfg.sender}
            receiver={cfg.receiver}
            status={state.steps[i].status}
            accentColor={cfg.accent}
            data={Object.entries(state.steps[i].data).map(([label, value]) => ({
              label,
              value,
              mono: label.includes("Hash") || label.includes("Tx") || label === "Agent" || label === "Contract" || label === "Provider" || label === "Token",
            }))}
          />
        ))}
      </div>

      {/* After a successful demo, show a direct link to the create-escrow
          transaction on the Coston2 block explorer for live verification. */}
      {state.steps[5].status === "success" && state.steps[5].data["Create Tx"] && (
        <div className="mt-6 text-center">
          <a
            href={`${EXPLORER_URL}/tx/${state.steps[5].data["Create Tx"]}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-flare-coral hover:underline"
          >
            View on Coston2 Explorer
          </a>
        </div>
      )}
    </div>
  );
}
