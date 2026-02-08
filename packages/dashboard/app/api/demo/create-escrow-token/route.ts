import { NextResponse } from "next/server";
import { Contract, Wallet, JsonRpcProvider } from "ethers";
import { loadRootEnv } from "@/lib/loadEnv";

const ESCROW_ABI = [
  "function createEscrowWithToken(address _provider, string _endpoint, uint256 _timeout, address _token, uint256 _amount) returns (uint256 escrowId)",
  "event TokenEscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, address token, string endpoint)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
];

export async function POST(request: Request) {
  try {
    loadRootEnv();

    const { provider, endpoint, timeout, tokenAddress, amount } = await request.json();

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

    // Approve the escrow contract to spend the ERC-20 token
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(contractAddress, BigInt(amount));
    await approveTx.wait();

    // Create the token escrow on-chain
    const contract = new Contract(contractAddress, ESCROW_ABI, wallet);
    const tx = await contract.createEscrowWithToken(
      provider,
      endpoint,
      timeout,
      tokenAddress,
      BigInt(amount)
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === "TokenEscrowCreated");

    const escrowId = Number(event!.args.escrowId);

    return NextResponse.json({
      escrowId,
      txHash: receipt.hash,
      agent: wallet.address,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `createEscrowWithToken failed: ${error.message || error}` },
      { status: 500 }
    );
  }
}
