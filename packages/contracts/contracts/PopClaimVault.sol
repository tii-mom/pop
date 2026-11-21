// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PopClaimVault
 * @notice Gas-paid user batch claim vault for $POP using EIP-712 signed vouchers.
 *         Includes per-transaction and daily circuit breakers plus strict nonce replay protection.
 */
contract PopClaimVault is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address recipient,uint256 amount,uint256 nonce,uint256 deadline)");

    IERC20 public immutable popToken;
    address public claimSigner;
    uint256 public maxClaimPerTx;
    uint256 public dailyClaimLimit;

    mapping(address => uint256) public nonces;
    mapping(uint256 => uint256) public dailyClaimed;

    event PopClaimed(address indexed recipient, uint256 amount, uint256 nonce);
    event ClaimSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event LimitsUpdated(uint256 maxClaimPerTx, uint256 dailyClaimLimit);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidLimits();
    error SignatureExpired();
    error InvalidSignature();
    error ExceedsMaxClaimPerTx();
    error ExceedsDailyClaimLimit();

    constructor(
        address initialOwner,
        address popToken_,
        address claimSigner_,
        uint256 maxClaimPerTx_,
        uint256 dailyClaimLimit_
    ) Ownable(initialOwner) EIP712("PopClaimVault", "1") {
        if (popToken_ == address(0) || claimSigner_ == address(0)) {
            revert ZeroAddress();
        }
        if (maxClaimPerTx_ == 0 || dailyClaimLimit_ < maxClaimPerTx_) {
            revert InvalidLimits();
        }

        popToken = IERC20(popToken_);
        claimSigner = claimSigner_;
        maxClaimPerTx = maxClaimPerTx_;
        dailyClaimLimit = dailyClaimLimit_;
    }

    function claim(
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (amount > maxClaimPerTx) revert ExceedsMaxClaimPerTx();

        uint256 dayBucket = block.timestamp / 1 days;
        uint256 newDailyTotal = dailyClaimed[dayBucket] + amount;
        if (newDailyTotal > dailyClaimLimit) revert ExceedsDailyClaimLimit();

        uint256 currentNonce = nonces[msg.sender];
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_TYPEHASH, msg.sender, amount, currentNonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address recovered = ECDSA.recover(digest, signature);
        if (recovered != claimSigner) revert InvalidSignature();

        // State updates before token transfer
        nonces[msg.sender] = currentNonce + 1;
        dailyClaimed[dayBucket] = newDailyTotal;

        popToken.safeTransfer(msg.sender, amount);

        emit PopClaimed(msg.sender, amount, currentNonce);
    }

    function setClaimSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address oldSigner = claimSigner;
        claimSigner = newSigner;
        emit ClaimSignerUpdated(oldSigner, newSigner);
    }

    function setLimits(
        uint256 newMaxClaimPerTx,
        uint256 newDailyClaimLimit
    ) external onlyOwner {
        if (newMaxClaimPerTx == 0 || newDailyClaimLimit < newMaxClaimPerTx) {
            revert InvalidLimits();
        }
        maxClaimPerTx = newMaxClaimPerTx;
        dailyClaimLimit = newDailyClaimLimit;
        emit LimitsUpdated(newMaxClaimPerTx, newDailyClaimLimit);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw(address to, uint256 amount) external onlyOwner whenPaused {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        popToken.safeTransfer(to, amount);
        emit EmergencyWithdraw(to, amount);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
