import { Effect, Layer } from "effect";
import { Wallet, JsonRpcProvider } from "ethers";
import { GatewayWallet, ContractCallFailed } from "@flaregate/shared";

export const makeGatewayWalletLive = (privateKey: string, rpcUrl: string) => {
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  return Layer.succeed(GatewayWallet, {
    address: wallet.address,
    signAndSend: (tx: { to: string; data: string; value?: bigint }) =>
      Effect.tryPromise({
        try: async () => {
          const txResponse = await wallet.sendTransaction(tx);
          const receipt = await txResponse.wait();
          return receipt!.hash;
        },
        catch: (error) =>
          new ContractCallFailed({
            method: "signAndSend",
            reason: String(error),
          }),
      }),
  });
};
