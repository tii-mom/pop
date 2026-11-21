// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title PopToken ($POP)
 * @notice Fixed-supply 1,000,000,000 ERC20 token for the POP Box protocol.
 *         Zero transfer tax, no post-deployment minting, burnable by holders.
 *         Initial distribution:
 *           - 10% (100,000,000) Liquidity Pool (LP)
 *           - 20% (200,000,000) Team Reserve
 *           - 10% (100,000,000) Marketing & Ecosystem Growth
 *           - 60% (600,000,000) Blind Box Ecosystem Pool
 */
contract PopToken is ERC20, ERC20Burnable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;
    uint256 public constant LP_ALLOCATION = 100_000_000 * 1e18;
    uint256 public constant TEAM_ALLOCATION = 200_000_000 * 1e18;
    uint256 public constant MARKETING_ALLOCATION = 100_000_000 * 1e18;
    uint256 public constant ECOSYSTEM_ALLOCATION = 600_000_000 * 1e18;

    error ZeroAddress();

    constructor(
        address lpWallet,
        address teamWallet,
        address marketingWallet,
        address ecosystemWallet
    ) ERC20("POP Box", "POP") {
        if (
            lpWallet == address(0) ||
            teamWallet == address(0) ||
            marketingWallet == address(0) ||
            ecosystemWallet == address(0)
        ) {
            revert ZeroAddress();
        }

        _mint(lpWallet, LP_ALLOCATION);
        _mint(teamWallet, TEAM_ALLOCATION);
        _mint(marketingWallet, MARKETING_ALLOCATION);
        _mint(ecosystemWallet, ECOSYSTEM_ALLOCATION);
    }
}
