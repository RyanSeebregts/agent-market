import * as S from "@effect/schema/Schema";

export const ApiEndpointSchema = S.Struct({
  path: S.String,
  method: S.String,
  priceWei: S.String,
  description: S.String,
});

export const ApiListingSchema = S.Struct({
  id: S.String,
  name: S.String,
  description: S.String,
  providerAddress: S.String,
  baseUrl: S.String,
  endpoints: S.Array(ApiEndpointSchema),
});

export const AcceptedTokenSchema = S.Struct({
  symbol: S.String,
  address: S.String,
  priceUnits: S.String,
});

export const PaymentInfoSchema = S.Struct({
  error: S.String,
  price: S.String,
  currency: S.String,
  provider: S.String,
  endpoint: S.String,
  contractAddress: S.String,
  chainId: S.Number,
  instructions: S.String,
  acceptedTokens: S.optional(S.Array(AcceptedTokenSchema)),
});

export const EscrowOnChainSchema = S.Struct({
  id: S.BigIntFromSelf,
  agent: S.String,
  provider: S.String,
  amount: S.BigIntFromSelf,
  token: S.String,
  endpoint: S.String,
  deliveryHash: S.String,
  receiptHash: S.String,
  state: S.Number,
  createdAt: S.BigIntFromSelf,
  deliveredAt: S.BigIntFromSelf,
  timeout: S.BigIntFromSelf,
});
