import { Contract, JsonRpcProvider } from "ethers";

const ESCROW_ABI = [
    "function getEscrow(uint256 _escrowId) external view returns (tuple(uint256 id, address agent, address provider, uint256 amount, address token, string endpoint, bytes32 deliveryHash, bytes32 receiptHash, uint8 state, uint256 createdAt, uint256 deliveredAt, uint256 timeout))",
    "function nextEscrowId() external view returns (uint256)",
    "function getEscrowsByAgent(address _agent) external view returns (uint256[])",
    "function getEscrowsByProvider(address _provider) external view returns (uint256[])",
    "event EscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, string endpoint)",
    "event TokenEscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, address token, string endpoint)",
    "event DeliveryConfirmed(uint256 indexed escrowId, bytes32 dataHash)",
    "event ReceiptConfirmed(uint256 indexed escrowId, bytes32 dataHash, bool hashesMatch)",
    "event FundsReleased(uint256 indexed escrowId, address indexed provider, uint256 amount)",
    "event DisputeRaised(uint256 indexed escrowId, bytes32 deliveryHash, bytes32 receiptHash)",
    "event TimeoutClaimed(uint256 indexed escrowId)",
    "event Refunded(uint256 indexed escrowId)",
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://coston-api.flare.network/ext/C/rpc";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS || "";

export const getProvider = () => new JsonRpcProvider(RPC_URL);

export const getContract = () => {
    if (!CONTRACT_ADDRESS) return null;
    const provider = getProvider();
    return new Contract(CONTRACT_ADDRESS, ESCROW_ABI, provider);
};

export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://coston-explorer.flare.network";

export interface EscrowData {
    id: number;
    agent: string;
    provider: string;
    amount: bigint;
    token: string;          // address(0) = native C2FLR, otherwise ERC-20
    endpoint: string;
    deliveryHash: string;
    receiptHash: string;
    state: number;
    createdAt: number;
    deliveredAt: number;
    timeout: number;
}

export const STATE_NAMES = ["Created", "Delivered", "Completed", "Disputed", "Refunded", "Claimed"] as const;

/** Returns true if the escrow was paid with native C2FLR, false if an ERC-20 token */
export const isNativePayment = (escrow: EscrowData): boolean =>
    escrow.token === ZERO_ADDRESS;

export const fetchEscrow = async (id: number): Promise<EscrowData | null> => {
    const contract = getContract();
    if (!contract) return null;
    try {
        const e = await contract.getEscrow(id);
        return {
            id: Number(e.id),
            agent: e.agent,
            provider: e.provider,
            amount: e.amount,
            token: e.token,
            endpoint: e.endpoint,
            deliveryHash: e.deliveryHash,
            receiptHash: e.receiptHash,
            state: Number(e.state),
            createdAt: Number(e.createdAt),
            deliveredAt: Number(e.deliveredAt),
            timeout: Number(e.timeout),
        };
    } catch {
        return null;
    }
};

export const fetchNextEscrowId = async (): Promise<number> => {
    const contract = getContract();
    if (!contract) return 1;
    try {
        const id = await contract.nextEscrowId();
        return Number(id);
    } catch {
        return 1;
    }
};
