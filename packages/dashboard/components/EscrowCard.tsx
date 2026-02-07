"use client";

import { formatEther } from "ethers";
import { StatusBadge } from "./StatusBadge";
import type { EscrowData } from "@/lib/contract";
import { EXPLORER_URL } from "@/lib/contract";

function truncate(addr: string) {
  if (!addr || addr === "0x" + "0".repeat(64)) return "—";
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

function formatTs(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export function EscrowCard({ escrow }: { escrow: EscrowData }) {
  const hashesMatch =
    escrow.deliveryHash &&
    escrow.receiptHash &&
    escrow.deliveryHash !== "0x" + "0".repeat(64) &&
    escrow.receiptHash !== "0x" + "0".repeat(64) &&
    escrow.deliveryHash === escrow.receiptHash;

  return (
    <div className="bg-flare-card border border-flare-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Escrow #{escrow.id}</h3>
        <StatusBadge state={escrow.state} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-gray-500 block">Agent</span>
          <span className="text-sm text-gray-300 font-mono">{truncate(escrow.agent)}</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Provider</span>
          <span className="text-sm text-gray-300 font-mono">{truncate(escrow.provider)}</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Amount</span>
          <span className="text-sm text-amber-400 font-semibold">
            {formatEther(escrow.amount)} C2FLR
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Endpoint</span>
          <span className="text-sm text-gray-300 font-mono">{escrow.endpoint}</span>
        </div>
      </div>

      {(escrow.deliveryHash && escrow.deliveryHash !== "0x" + "0".repeat(64)) && (
        <div className="mb-3 bg-black/30 rounded-lg p-3 space-y-2">
          <div>
            <span className="text-xs text-gray-500">Delivery Hash</span>
            <p className="text-xs text-blue-400 font-mono break-all">{escrow.deliveryHash}</p>
          </div>
          {escrow.receiptHash && escrow.receiptHash !== "0x" + "0".repeat(64) && (
            <div>
              <span className="text-xs text-gray-500">Receipt Hash</span>
              <p className="text-xs text-purple-400 font-mono break-all">{escrow.receiptHash}</p>
            </div>
          )}
          {escrow.receiptHash && escrow.receiptHash !== "0x" + "0".repeat(64) && (
            <div className="flex items-center gap-2">
              {hashesMatch ? (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                  Hashes Match
                </span>
              ) : (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                  Hash Mismatch
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Created: {formatTs(escrow.createdAt)}</span>
        {escrow.deliveredAt > 0 && <span>Delivered: {formatTs(escrow.deliveredAt)}</span>}
      </div>
    </div>
  );
}
