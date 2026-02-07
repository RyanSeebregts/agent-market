import { Layer } from "effect";
import { makeAgentWalletLive } from "./services/wallet.js";
import { makeAgentEscrowLive } from "./services/escrow.js";

export const makeLiveLayer = (config: {
  privateKey: string;
  rpcUrl: string;
  contractAddress: string;
}) => {
  const walletLayer = makeAgentWalletLive(config.privateKey, config.rpcUrl);
  const escrowLayer = makeAgentEscrowLive(
    config.privateKey,
    config.rpcUrl,
    config.contractAddress
  );

  return Layer.mergeAll(walletLayer, escrowLayer);
};
