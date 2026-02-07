import { Layer } from "effect";
import { ApiRegistryLive } from "./services/registry.js";
import { makeEscrowContractLive } from "./services/escrow.js";
import { makeGatewayWalletLive } from "./services/wallet.js";

export const makeLiveLayer = (config: {
  privateKey: string;
  rpcUrl: string;
  contractAddress: string;
}) => {
  const escrowLayer = makeEscrowContractLive(
    config.privateKey,
    config.rpcUrl,
    config.contractAddress
  );
  const walletLayer = makeGatewayWalletLive(config.privateKey, config.rpcUrl);

  return Layer.mergeAll(ApiRegistryLive, escrowLayer, walletLayer);
};
