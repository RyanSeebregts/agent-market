import { Router } from "express";
import { Effect } from "effect";
import type { Layer } from "effect";
import {
    ApiRegistry,
    EscrowContract,
    GatewayWallet,
    hashResponseData,
    EscrowState,
    ApiCallFailed,
} from "@flaregate/shared";

type ProxyLayer = Layer.Layer<ApiRegistry | EscrowContract | GatewayWallet>;

const fetchApi = (url: string, method: string, body?: any) =>
    Effect.tryPromise({
        try: async () => {
            const resp = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                ...(method !== "GET" && body ? { body: JSON.stringify(body) } : {}),
            });
            return await resp.text();
        },
        catch: (error) =>
            new ApiCallFailed({ url, status: 0, body: String(error) }),
    });

export const makeProxyRouter = (layer: ProxyLayer) => {
    const router = Router();

    // Use a regex-based route to capture the wildcard path
    router.all(/^\/proxy\/([^/]+)\/(.*)$/, async (req, res) => {
        const listingId = req.params[0];
        const wildcard = req.params[1] || "";
        const subPath = "/" + wildcard;
        const escrowIdHeader = req.headers["x-escrow-id"] as string | undefined;

        const program = Effect.gen(function* () {
            const registry = yield* ApiRegistry;
            const contract = yield* EscrowContract;
            const wallet = yield* GatewayWallet;

            // Look up the API listing
            const listing = yield* registry.getById(listingId);

            // Find matching endpoint
            const endpoint = listing.endpoints.find((e) => subPath.startsWith(e.path));
            const priceWei = endpoint?.priceWei || listing.endpoints[0]?.priceWei || "0";

            // If no escrow ID, return 402
            if (!escrowIdHeader) {
                return {
                    status: 402 as const,
                    body: {
                        error: "Payment Required",
                        price: priceWei,
                        currency: "C2FLR",
                        provider: listing.providerAddress || wallet.address,
                        endpoint: subPath,
                        contractAddress: process.env.ESCROW_CONTRACT_ADDRESS || "",
                        chainId: 16,
                        instructions:
                            "Create escrow with createEscrow(provider, endpoint, timeout) and retry with X-Escrow-Id header",
                    },
                    headers: undefined as Record<string, string> | undefined,
                };
            }

            // Verify escrow on-chain
            const escrowId = Number(escrowIdHeader);
            const escrow = yield* contract.getEscrow(escrowId);

            if (escrow.state !== EscrowState.Created) {
                return {
                    status: 400 as const,
                    body: { error: `Escrow #${escrowId} is not in Created state (state: ${escrow.state})` },
                    headers: undefined as Record<string, string> | undefined,
                };
            }

            if (BigInt(escrow.amount) < BigInt(priceWei)) {
                return {
                    status: 400 as const,
                    body: {
                        error: `Escrow amount insufficient. Required: ${priceWei}, deposited: ${escrow.amount}`,
                    },
                    headers: undefined as Record<string, string> | undefined,
                };
            }

            // Forward request to the actual (mock) API
            const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
            const targetUrl = `${listing.baseUrl}${subPath}${queryString ? "?" + queryString : ""}`;

            const responseBody = yield* fetchApi(targetUrl, req.method, req.body);

            // Hash the response
            const dataHash = hashResponseData(responseBody);

            // Confirm delivery on-chain (gateway acts as provider)
            yield* contract.confirmDelivery(escrowId, dataHash);

            return {
                status: 200 as const,
                body: JSON.parse(responseBody),
                headers: { "X-Data-Hash": dataHash, "X-Escrow-Id": String(escrowId) } as Record<string, string> | undefined,
            };
        }).pipe(
            Effect.provide(layer),
            Effect.catchTag("ApiNotFound", (e) =>
                Effect.succeed({
                    status: 404 as const,
                    body: { error: `API listing '${e.listingId}' not found` },
                    headers: undefined as Record<string, string> | undefined,
                })
            ),
            Effect.catchTag("EscrowNotFound", (e) =>
                Effect.succeed({
                    status: 400 as const,
                    body: { error: `Escrow #${e.escrowId} not found on-chain` },
                    headers: undefined as Record<string, string> | undefined,
                })
            ),
            Effect.catchTag("ContractCallFailed", (e) =>
                Effect.succeed({
                    status: 500 as const,
                    body: { error: `Contract call failed: ${e.method} — ${e.reason}` },
                    headers: undefined as Record<string, string> | undefined,
                })
            ),
            Effect.catchTag("ApiCallFailed", (e) =>
                Effect.succeed({
                    status: 502 as const,
                    body: { error: `API call failed: ${e.url} — ${e.body}` },
                    headers: undefined as Record<string, string> | undefined,
                })
            )
        );

        try {
            const result = await Effect.runPromise(program);
            if (result.headers) {
                Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
            }
            res.status(result.status).json(result.body);
        } catch (error) {
            res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
};
