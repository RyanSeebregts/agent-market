"use client";

import { useState } from "react";
import { EscrowCard } from "@/components/EscrowCard";
import { fetchEscrow, type EscrowData } from "@/lib/contract";

export default function EscrowsPage() {
  const [query, setQuery] = useState("");
  const [escrow, setEscrow] = useState<EscrowData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setEscrow(null);

    const id = Number(query.trim());
    if (isNaN(id) || id <= 0) {
      setError("Please enter a valid escrow ID (positive number)");
      setLoading(false);
      return;
    }

    const result = await fetchEscrow(id);
    if (result) {
      setEscrow(result);
    } else {
      setError(`Escrow #${id} not found`);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Escrow Explorer</h2>
        <p className="text-gray-400">Look up escrow details by ID</p>
      </div>

      <div className="flex gap-3 mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Enter escrow ID (e.g. 1)"
          className="flex-1 bg-flare-card border border-flare-border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-flare-coral/50"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-flare-coral hover:bg-flare-coral/80 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {escrow && (
        <div className="max-w-xl">
          <EscrowCard escrow={escrow} />
        </div>
      )}

      {!escrow && !error && !loading && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">Search for an escrow</p>
          <p className="text-sm">
            Enter an escrow ID to view its on-chain details and hash verification status
          </p>
        </div>
      )}
    </div>
  );
}
