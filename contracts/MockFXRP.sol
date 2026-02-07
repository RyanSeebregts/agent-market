// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock FXRP token for testing FAssets integration.
/// In production, FXRP would be the real FAssets synthetic XRP on Flare.
contract MockFXRP is ERC20 {
    constructor() ERC20("Mock FXRP", "FXRP") {
        // Mint 1,000,000 FXRP to the deployer for testing
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Anyone can mint tokens on testnet for demo purposes
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
