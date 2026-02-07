import { Effect, Layer } from "effect";
import { Contract, Wallet, JsonRpcProvider } from "ethers";
import {
  EscrowContract,
  ContractCallFailed,
  EscrowNotFound,
  ESCROW_ABI,
  ERC20_ABI,
  EscrowState,
} from "@flaregate/shared";
import type { Escrow, CreateEscrowParams, CreateTokenEscrowParams } from "@flaregate/shared";

export const makeAgentEscrowLive = (privateKey: string, rpcUrl: string, contractAddress: string) => {
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const contract = new Contract(contractAddress, ESCROW_ABI, wallet);

  return Layer.succeed(EscrowContract, {
    createEscrow: (params: CreateEscrowParams) =>
      Effect.tryPromise({
        try: async () => {
          const tx = await contract.createEscrow(
            params.provider,
            params.endpoint,
            params.timeout,
            { value: params.value }
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
            .find((e: any) => e?.name === "EscrowCreated");
          return Number(event!.args.escrowId);
        },
        catch: (error) =>
          new ContractCallFailed({
            method: "createEscrow",
            reason: String(error),
          }),
      }),

    createEscrowWithToken: (params: CreateTokenEscrowParams) =>
      Effect.tryPromise({
        try: async () => {
          // Approve the escrow contract to spend tokens
          const tokenContract = new Contract(params.token, ERC20_ABI, wallet);
          const approveTx = await tokenContract.approve(contractAddress, params.amount);
          await approveTx.wait();

          const tx = await contract.createEscrowWithToken(
            params.provider,
            params.endpoint,
            params.timeout,
            params.token,
            params.amount
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
          return Number(event!.args.escrowId);
        },
        catch: (error) =>
          new ContractCallFailed({
            method: "createEscrowWithToken",
            reason: String(error),
          }),
      }),

    confirmDelivery: (escrowId: number, hash: string) =>
      Effect.tryPromise({
        try: async () => {
          const tx = await contract.confirmDelivery(escrowId, hash);
          await tx.wait();
        },
        catch: (error) =>
          new ContractCallFailed({
            method: "confirmDelivery",
            reason: String(error),
          }),
      }),

    confirmReceived: (escrowId: number, hash: string) =>
      Effect.tryPromise({
        try: async () => {
          const tx = await contract.confirmReceived(escrowId, hash);
          const receipt = await tx.wait();
          const event = receipt.logs
            .map((log: any) => {
              try {
                return contract.interface.parseLog(log);
              } catch {
                return null;
              }
            })
            .find((e: any) => e?.name === "ReceiptConfirmed");
          return Boolean(event!.args.hashesMatch);
        },
        catch: (error) =>
          new ContractCallFailed({
            method: "confirmReceived",
            reason: String(error),
          }),
      }),

    getEscrow: (escrowId: number) =>
      Effect.tryPromise({
        try: async () => {
          const e = await contract.getEscrow(escrowId);
          return {
            id: Number(e.id),
            agent: e.agent,
            provider: e.provider,
            amount: e.amount,
            token: e.token,
            endpoint: e.endpoint,
            deliveryHash: e.deliveryHash,
            receiptHash: e.receiptHash,
            state: Number(e.state) as EscrowState,
            createdAt: Number(e.createdAt),
            deliveredAt: Number(e.deliveredAt),
            timeout: Number(e.timeout),
          } as Escrow;
        },
        catch: () => new EscrowNotFound({ escrowId }),
      }),
  });
};
