import { NextResponse } from "next/server";
import { Contract, Wallet, JsonRpcProvider } from "ethers";
import { loadRootEnv } from "@/lib/loadEnv";

const ESCROW_ABI = [
  "function confirmReceived(uint256 _escrowId, bytes32 _dataHash)",
  "event ReceiptConfirmed(uint256 indexed escrowId, bytes32 dataHash, bool hashesMatch)",
  "event FundsReleased(uint256 indexed escrowId, address indexed provider, uint256 amount)",
];

export async function POST(request: Request) {
  try {
    loadRootEnv();

    const { escrowId, dataHash } = await request.json();

    const privateKey = process.env.AGENT_PRIVATE_KEY;
    const rpcUrl = process.env.RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;

    if (!privateKey || !contractAddress) {
      return NextResponse.json(
        { error: "Server missing AGENT_PRIVATE_KEY or ESCROW_CONTRACT_ADDRESS" },
        { status: 500 }
      );
    }

    const rpcProvider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, rpcProvider);
    const contract = new Contract(contractAddress, ESCROW_ABI, wallet);

    const tx = await contract.confirmReceived(escrowId, dataHash);
    const receipt = await tx.wait();

    const receiptEvent = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === "ReceiptConfirmed");

    const hashesMatch = Boolean(receiptEvent?.args.hashesMatch);

    const fundsEvent = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === "FundsReleased");

    return NextResponse.json({
      txHash: receipt.hash,
      hashesMatch,
      fundsReleased: !!fundsEvent,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `confirmReceived failed: ${error.message || error}` },
      { status: 500 }
    );
  }
}
