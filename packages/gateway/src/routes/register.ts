import { Router } from "express";
import { Effect } from "effect";
import { ApiRegistry } from "@flaregate/shared";
import type { Layer } from "effect";

export const makeRegisterRouter = (layer: Layer.Layer<ApiRegistry>) => {
  const router = Router();

  router.post("/register", async (req, res) => {
    const program = Effect.gen(function* () {
      const registry = yield* ApiRegistry;
      const listing = yield* registry.register(req.body);
      return listing;
    }).pipe(
      Effect.provide(layer),
      Effect.catchTag("RegistryError", (e) =>
        Effect.succeed({ error: e.reason })
      )
    );

    try {
      const result = await Effect.runPromise(program);
      if ("error" in result) {
        res.status(400).json(result);
      } else {
        res.status(201).json(result);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to register API" });
    }
  });

  return router;
};
