export enum EscrowState {
  Created = 0,
  Delivered = 1,
  Completed = 2,
  Disputed = 3,
  Refunded = 4,
  Claimed = 5,
}

export interface Escrow {
  id: number;
  agent: string;
  provider: string;
  amount: bigint;
  endpoint: string;
  deliveryHash: string;
  receiptHash: string;
  state: EscrowState;
  createdAt: number;
  deliveredAt: number;
  timeout: number;
}

export interface ApiEndpoint {
  path: string;
  method: string;
  priceWei: string;
  description: string;
}

export interface ApiListing {
  id: string;
  name: string;
  description: string;
  providerAddress: string;
  baseUrl: string;
  endpoints: ApiEndpoint[];
}

export interface CreateEscrowParams {
  provider: string;
  endpoint: string;
  timeout: number;
  value: bigint;
}

export interface PaymentInfo {
  error: string;
  price: string;
  currency: string;
  provider: string;
  endpoint: string;
  contractAddress: string;
  chainId: number;
  instructions: string;
}
