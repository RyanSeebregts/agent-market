// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FlareGateEscrow is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum EscrowState { Created, Delivered, Completed, Disputed, Refunded, Claimed }

    struct Escrow {
        uint256 id;
        address agent;
        address provider;
        uint256 amount;
        address token;          // address(0) = native C2FLR, otherwise ERC-20 (e.g. FXRP)
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

    /// @notice Tokens that are approved for use as escrow payment
    mapping(address => bool) public allowedTokens;

    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public agentEscrows;
    mapping(address => uint256[]) public providerEscrows;

    event EscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, string endpoint);
    event TokenEscrowCreated(uint256 indexed escrowId, address indexed agent, address indexed provider, uint256 amount, address token, string endpoint);
    event DeliveryConfirmed(uint256 indexed escrowId, bytes32 dataHash);
    event ReceiptConfirmed(uint256 indexed escrowId, bytes32 dataHash, bool hashesMatch);
    event FundsReleased(uint256 indexed escrowId, address indexed provider, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, bytes32 deliveryHash, bytes32 receiptHash);
    event TimeoutClaimed(uint256 indexed escrowId);
    event Refunded(uint256 indexed escrowId);
    event TokenAllowed(address indexed token, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _feeRecipient) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        nextEscrowId = 1;
    }

    /// @notice Allow or disallow an ERC-20 token for escrow payments (e.g. FXRP)
    function setAllowedToken(address _token, bool _allowed) external onlyOwner {
        require(_token != address(0), "Invalid token address");
        allowedTokens[_token] = _allowed;
        emit TokenAllowed(_token, _allowed);
    }

    /// @notice Create escrow with native C2FLR (original flow)
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
            token: address(0),
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

    /// @notice Create escrow with an ERC-20 token (e.g. FXRP FAsset)
    /// @dev Agent must approve this contract for _amount before calling
    function createEscrowWithToken(
        address _provider,
        string calldata _endpoint,
        uint256 _timeout,
        address _token,
        uint256 _amount
    ) external whenNotPaused returns (uint256 escrowId) {
        require(_amount > 0, "Must deposit funds");
        require(_provider != address(0), "Invalid provider");
        require(_timeout > 0, "Timeout must be positive");
        require(allowedTokens[_token], "Token not allowed");

        // Transfer tokens from agent to this contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            id: escrowId,
            agent: msg.sender,
            provider: _provider,
            amount: _amount,
            token: _token,
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

        emit TokenEscrowCreated(escrowId, msg.sender, _provider, _amount, _token, _endpoint);
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

        if (escrow.token == address(0)) {
            (bool sent, ) = payable(escrow.agent).call{value: escrow.amount}("");
            require(sent, "Refund transfer failed");
        } else {
            IERC20(escrow.token).safeTransfer(escrow.agent, escrow.amount);
        }

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

        if (escrow.token == address(0)) {
            // Native C2FLR
            (bool sentProvider, ) = payable(escrow.provider).call{value: payout}("");
            require(sentProvider, "Provider transfer failed");

            if (fee > 0) {
                (bool sentFee, ) = payable(feeRecipient).call{value: fee}("");
                require(sentFee, "Fee transfer failed");
            }
        } else {
            // ERC-20 token (e.g. FXRP)
            IERC20(escrow.token).safeTransfer(escrow.provider, payout);

            if (fee > 0) {
                IERC20(escrow.token).safeTransfer(feeRecipient, fee);
            }
        }
    }
}
