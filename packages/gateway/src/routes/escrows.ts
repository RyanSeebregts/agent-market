import { Router } from "express";
import { Effect } from "effect";
import { EscrowContract } from "@flaregate/shared";
import type { Layer } from "effect";

export const makeEscrowsRouter = (layer: Layer.Layer<EscrowContract>) => {
  const router = Router();

  router.get("/escrows/:address", async (req, res) => {
    const { address } = req.params;

    const program = Effect.gen(function* () {
      const contract = yield* EscrowContract;

      // If numeric, treat as escrow ID
      if (/^\d+$/.test(address)) {
        const escrow = yield* contract.getEscrow(Number(address));
        return { escrow };
      }

      return {
        message: `Query escrows for address ${address}`,
        hint: "Use the dashboard or contract explorer for full queries",
      };
    }).pipe(Effect.provide(layer));

    try {
      const result = await Effect.runPromise(program);
      res.json(result);
    } catch (error: any) {
      if (error?._tag === "EscrowNotFound") {
        res.status(404).json({ error: `Escrow #${error.escrowId} not found` });
      } else {
        res.status(500).json({ error: "Failed to fetch escrows" });
      }
    }
  });

  return router;
};
