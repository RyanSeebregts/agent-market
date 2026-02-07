import { Effect, Console, Duration } from "effect";
import {
  EscrowContract,
  AgentWallet,
  hashResponseData,
  InsufficientFunds,
  ApiCallFailed,
} from "@flaregate/shared";
import type { PaymentInfo } from "@flaregate/shared";

interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const httpGet = (url: string, extraHeaders?: Record<string, string>): Effect.Effect<HttpResponse, ApiCallFailed> =>
  Effect.tryPromise({
    try: async () => {
      const resp = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...extraHeaders,
        },
      });
      const body = await resp.text();
      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: resp.status, body, headers };
    },
    catch: (error) =>
      new ApiCallFailed({
        url,
        status: 0,
        body: String(error),
      }),
  });

export const getCatalog = (gatewayUrl: string) =>
  httpGet(`${gatewayUrl}/api/catalog`).pipe(
    Effect.map((r) => JSON.parse(r.body))
  );

export const agentFetch = (
  gatewayUrl: string,
  listingId: string,
  path: string,
  options?: {
    maxPriceWei?: bigint;
    timeout?: number;
  }
) =>
  Effect.gen(function* () {
    const wallet = yield* AgentWallet;
    const contract = yield* EscrowContract;

    // 1. Make initial request to gateway
    yield* Console.log("  Making initial request...");
    const initialResponse = yield* httpGet(`${gatewayUrl}/api/proxy/${listingId}${path}`);

    // 2. If not 402, something unexpected
    if (initialResponse.status !== 402) {
      return yield* Effect.fail(
        new ApiCallFailed({
          url: path,
          status: initialResponse.status,
          body: initialResponse.body,
        })
      );
    }

    // 3. Parse payment requirements
    const paymentInfo: PaymentInfo = JSON.parse(initialResponse.body);

    yield* Console.log(`  Payment required: ${paymentInfo.price} wei (${paymentInfo.currency})`);
    yield* Console.log(`  Provider: ${paymentInfo.provider}`);
    yield* Console.log(`  Contract: ${paymentInfo.contractAddress}`);

    // 4. Check price against max
    if (options?.maxPriceWei && BigInt(paymentInfo.price) > options.maxPriceWei) {
      return yield* Effect.fail(
        new InsufficientFunds({
          required: BigInt(paymentInfo.price),
          available: options.maxPriceWei,
        })
      );
    }

    // 5. Create escrow on-chain
    yield* Effect.sleep(Duration.millis(500));
    yield* Console.log("\n  Creating escrow and depositing funds...");
    const escrowId = yield* contract.createEscrow({
      provider: paymentInfo.provider,
      endpoint: paymentInfo.endpoint,
      timeout: options?.timeout ?? 300,
      value: BigInt(paymentInfo.price),
    });
    yield* Console.log(`  Escrow #${escrowId} created on-chain!`);

    // 6. Retry request with escrow ID
    yield* Effect.sleep(Duration.millis(500));
    yield* Console.log("\n  Retrying API call with payment proof...");
    const dataResponse = yield* httpGet(
      `${gatewayUrl}/api/proxy/${listingId}${path}`,
      { "X-Escrow-Id": String(escrowId) }
    );

    if (dataResponse.status !== 200) {
      return yield* Effect.fail(
        new ApiCallFailed({
          url: path,
          status: dataResponse.status,
          body: dataResponse.body,
        })
      );
    }

    // 7. Hash received data and compare
    const localHash = hashResponseData(dataResponse.body);
    const gatewayHash = dataResponse.headers["x-data-hash"] || "unknown";

    yield* Console.log(`\n  Local hash:   ${localHash}`);
    yield* Console.log(`  Gateway hash: ${gatewayHash}`);

    // 8. Confirm receipt on-chain
    yield* Effect.sleep(Duration.millis(500));
    yield* Console.log("\n  Confirming receipt on-chain...");
    const hashesMatch = yield* contract.confirmReceived(escrowId, localHash);

    return {
      data: JSON.parse(dataResponse.body),
      escrowId,
      dataHash: localHash,
      hashesMatch,
    };
  });

/**
 * agentFetchWithToken — same as agentFetch but pays with an ERC-20 token (e.g. FXRP).
 * The agent must hold the token. The SDK handles approve + createEscrowWithToken.
 */
export const agentFetchWithToken = (
  gatewayUrl: string,
  listingId: string,
  path: string,
  tokenAddress: string,
  options?: {
    maxPriceUnits?: bigint;
    timeout?: number;
  }
) =>
  Effect.gen(function* () {
    const wallet = yield* AgentWallet;
    const contract = yield* EscrowContract;

    // 1. Make initial request to gateway
    yield* Console.log("  Making initial request...");
    const initialResponse = yield* httpGet(`${gatewayUrl}/api/proxy/${listingId}${path}`);

    // 2. If not 402, something unexpected
    if (initialResponse.status !== 402) {
      return yield* Effect.fail(
        new ApiCallFailed({
          url: path,
          status: initialResponse.status,
          body: initialResponse.body,
        })
      );
    }

    // 3. Parse payment requirements
    const paymentInfo: PaymentInfo = JSON.parse(initialResponse.body);

    // Find the matching token in acceptedTokens
    const tokenInfo = paymentInfo.acceptedTokens?.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    const priceUnits = tokenInfo?.priceUnits || paymentInfo.price;

    yield* Console.log(`  Payment required: ${priceUnits} token units (${tokenInfo?.symbol || "TOKEN"})`);
    yield* Console.log(`  Provider: ${paymentInfo.provider}`);
    yield* Console.log(`  Contract: ${paymentInfo.contractAddress}`);
    yield* Console.log(`  Token: ${tokenAddress}`);

    // 4. Check price against max
    if (options?.maxPriceUnits && BigInt(priceUnits) > options.maxPriceUnits) {
      return yield* Effect.fail(
        new InsufficientFunds({
          required: BigInt(priceUnits),
          available: options.maxPriceUnits,
        })
      );
    }

    // 5. Create token escrow on-chain (approve + deposit in one call)
    yield* Effect.sleep(Duration.millis(500));
    yield* Console.log("\n  Approving token and creating escrow...");
    const escrowId = yield* contract.createEscrowWithToken({
      provider: paymentInfo.provider,
      endpoint: paymentInfo.endpoint,
      timeout: options?.timeout ?? 300,
      token: tokenAddress,
      amount: BigInt(priceUnits),
    });
    yield* Console.log(`  Escrow #${escrowId} created on-chain with token payment!`);

    // 6. Retry request with escrow ID
    yield* Effect.sleep(Duration.millis(500));
    yield* Console.log("\n  Retrying API call with payment proof...");
    const dataResponse = yield* httpGet(
      `${gatewayUrl}/api/proxy/${listingId}${path}`,
      { "X-Escrow-Id": String(escrowId) }
    );

    if (dataResponse.status !== 200) {
      return yield* Effect.fail(
        new ApiCallFailed({
          url: path,
          status: dataResponse.status,
          body: dataResponse.body,
        })
      );
    }

    // 7. Hash received data and compare
    const localHash = hashResponseData(dataResponse.body);
    const gatewayHash = dataResponse.headers["x-data-hash"] || "unknown";

    yield* Console.log(`\n  Local hash:   ${localHash}`);
    yield* Console.log(`  Gateway hash: ${gatewayHash}`);

    // 8. Confirm receipt on-chain
    yield* Effect.sleep(Duration.millis(500));
    yield* Console.log("\n  Confirming receipt on-chain...");
    const hashesMatch = yield* contract.confirmReceived(escrowId, localHash);

    return {
      data: JSON.parse(dataResponse.body),
      escrowId,
      dataHash: localHash,
      hashesMatch,
      paymentMethod: "token" as const,
      tokenAddress,
    };
  });
