import { Data } from "effect";

export class EscrowNotFound extends Data.TaggedError("EscrowNotFound")<{
  escrowId: number;
}> {}

export class InsufficientFunds extends Data.TaggedError("InsufficientFunds")<{
  required: bigint;
  available: bigint;
}> {}

export class HashMismatch extends Data.TaggedError("HashMismatch")<{
  expected: string;
  received: string;
}> {}

export class ContractCallFailed extends Data.TaggedError("ContractCallFailed")<{
  method: string;
  reason: string;
}> {}

export class PaymentRequired extends Data.TaggedError("PaymentRequired")<{
  price: string;
  provider: string;
  endpoint: string;
  contractAddress: string;
}> {}

export class ApiCallFailed extends Data.TaggedError("ApiCallFailed")<{
  url: string;
  status: number;
  body: string;
}> {}

export class TimeoutExpired extends Data.TaggedError("TimeoutExpired")<{
  escrowId: number;
}> {}

export class ApiNotFound extends Data.TaggedError("ApiNotFound")<{
  listingId: string;
}> {}

export class RegistryError extends Data.TaggedError("RegistryError")<{
  reason: string;
}> {}

export class TokenNotAllowed extends Data.TaggedError("TokenNotAllowed")<{
  token: string;
}> {}
