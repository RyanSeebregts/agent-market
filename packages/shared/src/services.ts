import { Context, Effect } from "effect";
import type { Escrow, ApiListing, CreateEscrowParams, CreateTokenEscrowParams } from "./types.js";
import type {
  ContractCallFailed,
  EscrowNotFound,
  ApiNotFound,
  RegistryError,
} from "./errors.js";

export class EscrowContract extends Context.Tag("EscrowContract")<
  EscrowContract,
  {
    createEscrow: (
      params: CreateEscrowParams
    ) => Effect.Effect<number, ContractCallFailed>;
    createEscrowWithToken: (
      params: CreateTokenEscrowParams
    ) => Effect.Effect<number, ContractCallFailed>;
    confirmDelivery: (
      escrowId: number,
      hash: string
    ) => Effect.Effect<void, ContractCallFailed | EscrowNotFound>;
    confirmReceived: (
      escrowId: number,
      hash: string
    ) => Effect.Effect<boolean, ContractCallFailed | EscrowNotFound>;
    getEscrow: (escrowId: number) => Effect.Effect<Escrow, EscrowNotFound>;
  }
>() {}

export class ApiRegistry extends Context.Tag("ApiRegistry")<
  ApiRegistry,
  {
    getAll: () => Effect.Effect<ApiListing[]>;
    getById: (id: string) => Effect.Effect<ApiListing, ApiNotFound>;
    register: (listing: ApiListing) => Effect.Effect<ApiListing, RegistryError>;
  }
>() {}

export class GatewayWallet extends Context.Tag("GatewayWallet")<
  GatewayWallet,
  {
    address: string;
    signAndSend: (tx: {
      to: string;
      data: string;
      value?: bigint;
    }) => Effect.Effect<string, ContractCallFailed>;
  }
>() {}

export class AgentWallet extends Context.Tag("AgentWallet")<
  AgentWallet,
  {
    address: string;
    getBalance: () => Effect.Effect<bigint, ContractCallFailed>;
  }
>() {}
