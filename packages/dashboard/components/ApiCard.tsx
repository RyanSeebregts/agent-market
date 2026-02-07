"use client";

import { formatEther } from "ethers";
import type { ApiListing } from "@/lib/gateway";

export function ApiCard({ api }: { api: ApiListing }) {
  const truncate = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—";

  return (
    <div className="bg-flare-card border border-flare-border rounded-xl p-6 hover:border-flare-coral/40 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-bold text-white">{api.name}</h3>
        <span className="text-xs bg-flare-coral/20 text-flare-coral px-2 py-1 rounded-full font-medium">
          {api.endpoints.length} endpoint{api.endpoints.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-gray-400 text-sm mb-4">{api.description}</p>

      <div className="space-y-2">
        {api.endpoints.map((ep, i) => (
          <div
            key={i}
            className="flex items-center justify-between bg-black/30 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                {ep.method}
              </span>
              <span className="text-sm text-gray-300 font-mono">{ep.path}</span>
            </div>
            <span className="text-sm font-semibold text-amber-400">
              {formatEther(ep.priceWei)} C2FLR
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-flare-border">
        <span className="text-xs text-gray-500">
          Provider: {truncate(api.providerAddress)}
        </span>
      </div>
    </div>
  );
}
