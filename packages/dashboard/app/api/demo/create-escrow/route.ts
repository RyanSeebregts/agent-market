import { NextResponse } from "next/server";
import { Contract, Wallet, JsonRpcProvider } from "ethers";
import { loadRootEnv } from "@/lib/loadEnv";

const ESCROW_ABI = [
  "function createEscrow(address _provider, string _endpoint, uint256 _timeout) payable returns (uint256 escrowId)",
  "event EscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, string endpoint)",
];

export async function POST(request: Request) {
  try {
    loadRootEnv();

    const { provider, endpoint, timeout, valueWei } = await request.json();

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

    const tx = await contract.createEscrow(provider, endpoint, timeout, {
      value: BigInt(valueWei),
    });
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === "EscrowCreated");

    const escrowId = Number(event!.args.escrowId);

    return NextResponse.json({
      escrowId,
      txHash: receipt.hash,
      agent: wallet.address,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `createEscrow failed: ${error.message || error}` },
      { status: 500 }
    );
  }
}
