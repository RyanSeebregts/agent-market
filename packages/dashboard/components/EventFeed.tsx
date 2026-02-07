"use client";

import { useEffect, useState, useCallback } from "react";
import { formatEther, Contract, JsonRpcProvider } from "ethers";
import { EXPLORER_URL } from "@/lib/contract";

interface EventItem {
    id: string;
    type: string;
    emoji: string;
    message: string;
    blockNumber: number;
    txHash: string;
    timestamp: number;
}

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS || "";

const ESCROW_ABI = [
    "event EscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, string endpoint)",
    "event DeliveryConfirmed(uint256 indexed escrowId, bytes32 dataHash)",
    "event ReceiptConfirmed(uint256 indexed escrowId, bytes32 dataHash, bool hashesMatch)",
    "event FundsReleased(uint256 indexed escrowId, address indexed provider, uint256 amount)",
    "event DisputeRaised(uint256 indexed escrowId, bytes32 deliveryHash, bytes32 receiptHash)",
    "event TimeoutClaimed(uint256 indexed escrowId)",
    "event Refunded(uint256 indexed escrowId)",
];

function truncate(s: string) {
    return s ? `${s.slice(0, 6)}...${s.slice(-4)}` : "—";
}

export function EventFeed() {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [lastBlock, setLastBlock] = useState<number>(0);
    const [isLive, setIsLive] = useState(true);

    const fetchEvents = useCallback(async () => {
        if (!CONTRACT_ADDRESS) return;

        try {
            const provider = new JsonRpcProvider(RPC_URL);
            const contract = new Contract(CONTRACT_ADDRESS, ESCROW_ABI, provider);
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = lastBlock > 0 ? lastBlock + 1 : Math.max(0, currentBlock - 1000);

            if (fromBlock > currentBlock) return;

            const newEvents: EventItem[] = [];

            const escrowCreatedLogs = await contract.queryFilter("EscrowCreated", fromBlock, currentBlock);
            for (const log of escrowCreatedLogs) {
                const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
                if (!parsed) continue;
                newEvents.push({
                    id: `${log.transactionHash}-${log.index}`,
                    type: "EscrowCreated",
                    emoji: "NEW",
                    message: `Escrow #${parsed.args.escrowId} created by ${truncate(parsed.args.agent)} for ${parsed.args.endpoint} — ${formatEther(parsed.args.amount)} C2FLR`,
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                    timestamp: Date.now(),
                });
            }

            const deliveryLogs = await contract.queryFilter("DeliveryConfirmed", fromBlock, currentBlock);
            for (const log of deliveryLogs) {
                const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
                if (!parsed) continue;
                newEvents.push({
                    id: `${log.transactionHash}-${log.index}`,
                    type: "DeliveryConfirmed",
                    emoji: "PKG",
                    message: `Escrow #${parsed.args.escrowId} delivery confirmed — hash: ${truncate(parsed.args.dataHash)}`,
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                    timestamp: Date.now(),
                });
            }

            const receiptLogs = await contract.queryFilter("ReceiptConfirmed", fromBlock, currentBlock);
            for (const log of receiptLogs) {
                const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
                if (!parsed) continue;
                newEvents.push({
                    id: `${log.transactionHash}-${log.index}`,
                    type: "ReceiptConfirmed",
                    emoji: parsed.args.hashesMatch ? "OK" : "ERR",
                    message: `Escrow #${parsed.args.escrowId} receipt confirmed — hashes ${parsed.args.hashesMatch ? "match!" : "MISMATCH!"}`,
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                    timestamp: Date.now(),
                });
            }

            const fundsLogs = await contract.queryFilter("FundsReleased", fromBlock, currentBlock);
            for (const log of fundsLogs) {
                const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
                if (!parsed) continue;
                newEvents.push({
                    id: `${log.transactionHash}-${log.index}`,
                    type: "FundsReleased",
                    emoji: "$$$",
                    message: `Escrow #${parsed.args.escrowId} — ${formatEther(parsed.args.amount)} C2FLR released to ${truncate(parsed.args.provider)}`,
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                    timestamp: Date.now(),
                });
            }

            const disputeLogs = await contract.queryFilter("DisputeRaised", fromBlock, currentBlock);
            for (const log of disputeLogs) {
                const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
                if (!parsed) continue;
                newEvents.push({
                    id: `${log.transactionHash}-${log.index}`,
                    type: "DisputeRaised",
                    emoji: "!!!",
                    message: `Escrow #${parsed.args.escrowId} — hash mismatch! Dispute raised.`,
                    blockNumber: log.blockNumber,
                    txHash: log.transactionHash,
                    timestamp: Date.now(),
                });
            }

            if (newEvents.length > 0) {
                newEvents.sort((a, b) => b.blockNumber - a.blockNumber);
                setEvents((prev) => [...newEvents, ...prev].slice(0, 50));
            }

            setLastBlock(currentBlock);
        } catch (e) {
            console.error("Failed to fetch events:", e);
        }
    }, [lastBlock]);

    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 5000);
        return () => clearInterval(interval);
    }, [fetchEvents]);

    const eventStyles: Record<string, string> = {
        EscrowCreated: "border-l-amber-400",
        DeliveryConfirmed: "border-l-blue-400",
        ReceiptConfirmed: "border-l-emerald-400",
        FundsReleased: "border-l-green-400",
        DisputeRaised: "border-l-red-400",
        TimeoutClaimed: "border-l-orange-400",
        Refunded: "border-l-gray-400",
    };

    const emojiMap: Record<string, string> = {
        NEW: "🆕",
        PKG: "📦",
        OK: "✅",
        ERR: "❌",
        $$$: "💰",
        "!!!": "⚠️",
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
                    <span className="text-sm text-gray-400">
                        {isLive ? "Live — polling every 5s" : "Paused"}
                    </span>
                </div>
                <span className="text-xs text-gray-500">{events.length} events</span>
            </div>

            {events.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <p className="text-lg mb-2">Waiting for events...</p>
                    <p className="text-sm">Run the agent demo to see events appear here in real-time</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {events.map((event) => (
                        <div
                            key={event.id}
                            className={`bg-flare-card border border-flare-border border-l-4 ${eventStyles[event.type] || "border-l-gray-400"} rounded-lg p-4 transition-all`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <span className="text-lg">{emojiMap[event.emoji] || "📌"}</span>
                                    <div>
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                            {event.type}
                                        </span>
                                        <p className="text-sm text-gray-200 mt-0.5">{event.message}</p>
                                    </div>
                                </div>
                                <a
                                    href={`${EXPLORER_URL}/tx/${event.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-flare-coral hover:underline whitespace-nowrap ml-4"
                                >
                                    View Tx
                                </a>
                            </div>
                            <div className="mt-2 text-xs text-gray-600">
                                Block #{event.blockNumber}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
