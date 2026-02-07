import { keccak256, toUtf8Bytes } from "ethers";
import ESCROW_ABI from "./abi.json";

export { ESCROW_ABI };

export const hashResponseData = (responseBody: string): string =>
  keccak256(toUtf8Bytes(responseBody));
