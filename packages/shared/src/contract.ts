import { keccak256, toUtf8Bytes } from "ethers";
import ESCROW_ABI from "./abi.json";

export { ESCROW_ABI };

/** Minimal ERC-20 ABI for approve, balanceOf, symbol, and decimals */
export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function mint(address to, uint256 amount) external",
];

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const hashResponseData = (responseBody: string): string =>
  keccak256(toUtf8Bytes(responseBody));
