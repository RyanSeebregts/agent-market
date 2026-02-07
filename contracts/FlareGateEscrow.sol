// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract FlareGateEscrow is ReentrancyGuard, Pausable {
    enum EscrowState { Created, Delivered, Completed, Disputed, Refunded, Claimed }

    struct Escrow {
        uint256 id;
        address agent;
        address provider;
        uint256 amount;
        string endpoint;
        bytes32 deliveryHash;
        bytes32 receiptHash;
        EscrowState state;
        uint256 createdAt;
        uint256 deliveredAt;
        uint256 timeout;
    }

    uint256 public nextEscrowId;
    address public owner;
    address public feeRecipient;
    uint256 public constant FEE_BPS = 100; // 1% = 100 basis points

    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public agentEscrows;
    mapping(address => uint256[]) public providerEscrows;

    event EscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, string endpoint);
    event DeliveryConfirmed(uint256 indexed escrowId, bytes32 dataHash);
    event ReceiptConfirmed(uint256 indexed escrowId, bytes32 dataHash, bool hashesMatch);
    event FundsReleased(uint256 indexed escrowId, address indexed provider, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, bytes32 deliveryHash, bytes32 receiptHash);
    event TimeoutClaimed(uint256 indexed escrowId);
    event Refunded(uint256 indexed escrowId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _feeRecipient) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        nextEscrowId = 1;
    }

    function createEscrow(
        address _provider,
        string calldata _endpoint,
        uint256 _timeout
    ) external payable whenNotPaused returns (uint256 escrowId) {
        require(msg.value > 0, "Must deposit funds");
        require(_provider != address(0), "Invalid provider");
        require(_timeout > 0, "Timeout must be positive");

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            id: escrowId,
            agent: msg.sender,
            provider: _provider,
            amount: msg.value,
            endpoint: _endpoint,
            deliveryHash: bytes32(0),
            receiptHash: bytes32(0),
            state: EscrowState.Created,
            createdAt: block.timestamp,
            deliveredAt: 0,
            timeout: _timeout
        });

        agentEscrows[msg.sender].push(escrowId);
        providerEscrows[_provider].push(escrowId);

        emit EscrowCreated(escrowId, msg.sender, _provider, msg.value, _endpoint);
    }

    function confirmDelivery(
        uint256 _escrowId,
        bytes32 _dataHash
    ) external whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.id != 0, "Escrow does not exist");
        require(msg.sender == escrow.provider, "Only provider can confirm delivery");
        require(escrow.state == EscrowState.Created, "Invalid state");

        escrow.deliveryHash = _dataHash;
        escrow.state = EscrowState.Delivered;
        escrow.deliveredAt = block.timestamp;

        emit DeliveryConfirmed(_escrowId, _dataHash);
    }

    function confirmReceived(
        uint256 _escrowId,
        bytes32 _dataHash
    ) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.id != 0, "Escrow does not exist");
        require(msg.sender == escrow.agent, "Only agent can confirm receipt");
        require(escrow.state == EscrowState.Delivered, "Invalid state");

        escrow.receiptHash = _dataHash;

        bool hashesMatch = (_dataHash == escrow.deliveryHash);

        if (hashesMatch) {
            escrow.state = EscrowState.Completed;
            _releaseFunds(escrow);
            emit FundsReleased(_escrowId, escrow.provider, escrow.amount);
        } else {
            escrow.state = EscrowState.Disputed;
            emit DisputeRaised(_escrowId, escrow.deliveryHash, _dataHash);
        }

        emit ReceiptConfirmed(_escrowId, _dataHash, hashesMatch);
    }

    function claimTimeout(uint256 _escrowId) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.id != 0, "Escrow does not exist");
        require(msg.sender == escrow.provider, "Only provider can claim timeout");
        require(escrow.state == EscrowState.Delivered, "Invalid state");
        require(block.timestamp > escrow.deliveredAt + escrow.timeout, "Timeout not reached");

        escrow.state = EscrowState.Claimed;
        _releaseFunds(escrow);

        emit TimeoutClaimed(_escrowId);
    }

    function refund(uint256 _escrowId) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.id != 0, "Escrow does not exist");
        require(msg.sender == escrow.agent, "Only agent can request refund");
        require(escrow.state == EscrowState.Created, "Invalid state");
        require(block.timestamp > escrow.createdAt + escrow.timeout, "Timeout not reached");

        escrow.state = EscrowState.Refunded;

        (bool sent, ) = payable(escrow.agent).call{value: escrow.amount}("");
        require(sent, "Refund transfer failed");

        emit Refunded(_escrowId);
    }

    function getEscrow(uint256 _escrowId) external view returns (Escrow memory) {
        require(escrows[_escrowId].id != 0, "Escrow does not exist");
        return escrows[_escrowId];
    }

    function getEscrowsByAgent(address _agent) external view returns (uint256[] memory) {
        return agentEscrows[_agent];
    }

    function getEscrowsByProvider(address _provider) external view returns (uint256[] memory) {
        return providerEscrows[_provider];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    function _releaseFunds(Escrow storage escrow) internal {
        uint256 fee = (escrow.amount * FEE_BPS) / 10000;
        uint256 payout = escrow.amount - fee;

        (bool sentProvider, ) = payable(escrow.provider).call{value: payout}("");
        require(sentProvider, "Provider transfer failed");

        if (fee > 0) {
            (bool sentFee, ) = payable(feeRecipient).call{value: fee}("");
            require(sentFee, "Fee transfer failed");
        }
    }
}
