import { Effect, Layer } from "effect";
import * as fs from "fs";
import * as path from "path";
import { ApiRegistry, ApiNotFound, RegistryError } from "@flaregate/shared";
import type { ApiListing } from "@flaregate/shared";

const REGISTRY_PATH = path.resolve(__dirname, "../../data/registry.json");

const readRegistry = (): ApiListing[] => {
  const data = fs.readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(data);
};

const writeRegistry = (listings: ApiListing[]): void => {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(listings, null, 2));
};

export const ApiRegistryLive = Layer.succeed(ApiRegistry, {
  getAll: () => Effect.sync(() => readRegistry()),

  getById: (id: string) =>
    Effect.gen(function* () {
      const listings = readRegistry();
      const listing = listings.find((l) => l.id === id);
      if (!listing) {
        return yield* Effect.fail(new ApiNotFound({ listingId: id }));
      }
      return listing;
    }),

  register: (listing: ApiListing) =>
    Effect.gen(function* () {
      const listings = readRegistry();
      const existing = listings.findIndex((l) => l.id === listing.id);
      if (existing >= 0) {
        listings[existing] = listing;
      } else {
        listings.push(listing);
      }
      try {
        writeRegistry(listings);
      } catch (e) {
        return yield* Effect.fail(
          new RegistryError({ reason: String(e) })
        );
      }
      return listing;
    }),
});
