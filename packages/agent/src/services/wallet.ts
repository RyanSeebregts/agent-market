import { Effect, Layer } from "effect";
import { Wallet, JsonRpcProvider } from "ethers";
import { AgentWallet, ContractCallFailed } from "@flaregate/shared";

export const makeAgentWalletLive = (privateKey: string, rpcUrl: string) => {
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  return Layer.succeed(AgentWallet, {
    address: wallet.address,
    getBalance: () =>
      Effect.tryPromise({
        try: () => provider.getBalance(wallet.address),
        catch: (error) =>
          new ContractCallFailed({
            method: "getBalance",
            reason: String(error),
          }),
      }),
  });
};
