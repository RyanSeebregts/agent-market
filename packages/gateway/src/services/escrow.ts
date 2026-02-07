import { Effect, Layer } from "effect";
import { Contract, Wallet, JsonRpcProvider, formatEther } from "ethers";
import {
  EscrowContract,
  ContractCallFailed,
  EscrowNotFound,
  ESCROW_ABI,
  EscrowState,
} from "@flaregate/shared";
import type { Escrow, CreateEscrowParams } from "@flaregate/shared";

export const makeEscrowContractLive = (privateKey: string, rpcUrl: string, contractAddress: string) => {
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
