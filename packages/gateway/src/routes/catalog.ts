import { Router } from "express";
import { Effect } from "effect";
import { ApiRegistry } from "@flaregate/shared";
import type { Layer } from "effect";

export const makeCatalogRouter = (layer: Layer.Layer<ApiRegistry>) => {
    const router = Router();

    router.get("/catalog", async (_req, res) => {
        const program = Effect.gen(function* () {
            const registry = yield* ApiRegistry;
            return yield* registry.getAll();
        }).pipe(Effect.provide(layer));

        try {
            const listings = await Effect.runPromise(program);
            res.json({
                apis: listings,
                count: listings.length,
                contractAddress: process.env.ESCROW_CONTRACT_ADDRESS || "",
                chainId: 15,
                network: "coston Testnet",
            });
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch catalog" });
        }
    });

    return router;
};
