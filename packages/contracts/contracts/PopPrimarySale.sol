// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title PopPrimarySale
 * @notice Minimal on-chain primary blind-box sale contract on BNB Smart Chain.
 *         Enforces hard supply caps, on-chain referral-unlocked per-wallet caps,
 *         priority/public windows, optional Merkle proofs, and instant BNB forwarding (0 BNB retained).
 */
contract PopPrimarySale is Ownable, Pausable, ReentrancyGuard {
    uint16 public constant BPS_DENOMINATOR = 10_000;

    struct SeasonConfig {
        bool exists;
        uint64 priorityStartAt;
        uint64 publicStartAt;
        uint64 endAt;
        uint16 lpBps;
        uint16 reserveBps;
        uint16 teamBps;
        bytes32 poolCommitHash;
        bytes32 priorityMerkleRoot;
        bytes32 whaleWhitelistRoot;
    }

    struct TierConfig {
        bool configured;
        uint256 priceWei;
        uint32 maxSupply;
        uint32 sold;
        uint16 maxPerWallet;
        bool requiresWhaleWhitelist;
    }

    address public lpWallet;
    address public reserveWallet;
    address public teamWallet;

    mapping(uint256 => SeasonConfig) public seasons;
    mapping(uint256 => mapping(uint8 => TierConfig)) public tiers;
    mapping(uint256 => mapping(uint8 => mapping(address => uint16))) public walletPurchased;

    // On-chain real-time referral tracking & Whale public fallback switch
    mapping(uint256 => mapping(address => bool)) public hasPurchasedInSeason;
    mapping(uint256 => mapping(address => uint32)) public validReferrals;
    mapping(uint256 => bool) public whalePublicOpen;

    event SeasonCreated(
        uint256 indexed seasonId,
        uint64 priorityStartAt,
        uint64 publicStartAt,
        uint64 endAt,
        uint16 lpBps,
        uint16 reserveBps,
        uint16 teamBps,
        bytes32 poolCommitHash
    );

    event TierConfigured(
        uint256 indexed seasonId,
        uint8 indexed tierId,
        uint256 priceWei,
        uint32 maxSupply,
        uint16 maxPerWallet,
        bool requiresWhaleWhitelist
    );

    event MerkleRootsUpdated(
        uint256 indexed seasonId,
        bytes32 priorityMerkleRoot,
        bytes32 whaleWhitelistRoot
    );

    event WalletsUpdated(address lpWallet, address reserveWallet, address teamWallet);

    event WhalePublicOpenUpdated(uint256 indexed seasonId, bool isOpen);

    event ReferralRecorded(
        uint256 indexed seasonId,
        address indexed referrer,
        address indexed buyer,
        uint32 totalReferrals
    );

    event BoxPurchased(
        uint256 indexed seasonId,
        uint8 indexed tierId,
        address indexed buyer,
        uint16 quantity,
        uint32 startIndex,
        uint256 totalPaid
    );

    error ZeroAddress();
    error SeasonAlreadyExists();
    error SeasonNotFound();
    error InvalidTimeWindow();
    error InvalidBpsSplit();
    error InvalidTierConfig();
    error TierNotConfigured();
    error InvalidQuantity();
    error SaleNotStarted();
    error SaleEnded();
    error InvalidPriorityProof();
    error InvalidWhaleProof();
    error ExceedsTierSupply();
    error ExceedsWalletLimit();
    error InvalidPayment();
    error BnbTransferFailed();
    error DirectBnbNotAccepted();

    constructor(
        address initialOwner,
        address lpWallet_,
        address reserveWallet_,
        address teamWallet_
    ) Ownable(initialOwner) {
        if (
            lpWallet_ == address(0) ||
            reserveWallet_ == address(0) ||
            teamWallet_ == address(0)
        ) {
            revert ZeroAddress();
        }
        lpWallet = lpWallet_;
        reserveWallet = reserveWallet_;
        teamWallet = teamWallet_;
    }

    function createSeason(
        uint256 seasonId,
        uint64 priorityStartAt,
        uint64 publicStartAt,
        uint64 endAt,
        uint16 lpBps,
        uint16 reserveBps,
        uint16 teamBps,
        bytes32 poolCommitHash,
        bytes32 priorityMerkleRoot,
        bytes32 whaleWhitelistRoot
    ) external onlyOwner {
        if (seasons[seasonId].exists) revert SeasonAlreadyExists();
        if (priorityStartAt > publicStartAt || publicStartAt >= endAt) {
            revert InvalidTimeWindow();
        }
        if (uint256(lpBps) + uint256(reserveBps) + uint256(teamBps) != BPS_DENOMINATOR) {
            revert InvalidBpsSplit();
        }

        seasons[seasonId] = SeasonConfig({
            exists: true,
            priorityStartAt: priorityStartAt,
            publicStartAt: publicStartAt,
            endAt: endAt,
            lpBps: lpBps,
            reserveBps: reserveBps,
            teamBps: teamBps,
            poolCommitHash: poolCommitHash,
            priorityMerkleRoot: priorityMerkleRoot,
            whaleWhitelistRoot: whaleWhitelistRoot
        });

        emit SeasonCreated(
            seasonId,
            priorityStartAt,
            publicStartAt,
            endAt,
            lpBps,
            reserveBps,
            teamBps,
            poolCommitHash
        );
    }

    function configureTier(
        uint256 seasonId,
        uint8 tierId,
        uint256 priceWei,
        uint32 maxSupply,
        uint16 maxPerWallet,
        bool requiresWhaleWhitelist
    ) external onlyOwner {
        if (!seasons[seasonId].exists) revert SeasonNotFound();
        if (priceWei == 0 || maxSupply == 0 || maxPerWallet == 0) {
            revert InvalidTierConfig();
        }

        TierConfig storage tier = tiers[seasonId][tierId];
        if (maxSupply < tier.sold) revert InvalidTierConfig();

        tier.configured = true;
        tier.priceWei = priceWei;
        tier.maxSupply = maxSupply;
        tier.maxPerWallet = maxPerWallet;
        tier.requiresWhaleWhitelist = requiresWhaleWhitelist;

        emit TierConfigured(
            seasonId,
            tierId,
            priceWei,
            maxSupply,
            maxPerWallet,
            requiresWhaleWhitelist
        );
    }

    function updateMerkleRoots(
        uint256 seasonId,
        bytes32 priorityMerkleRoot,
        bytes32 whaleWhitelistRoot
    ) external onlyOwner {
        if (!seasons[seasonId].exists) revert SeasonNotFound();
        SeasonConfig storage season = seasons[seasonId];
        season.priorityMerkleRoot = priorityMerkleRoot;
        season.whaleWhitelistRoot = whaleWhitelistRoot;

        emit MerkleRootsUpdated(seasonId, priorityMerkleRoot, whaleWhitelistRoot);
    }

    function setWhalePublicOpen(uint256 seasonId, bool isOpen) external onlyOwner {
        if (!seasons[seasonId].exists) revert SeasonNotFound();
        whalePublicOpen[seasonId] = isOpen;
        emit WhalePublicOpenUpdated(seasonId, isOpen);
    }

    function updateWallets(
        address lpWallet_,
        address reserveWallet_,
        address teamWallet_
    ) external onlyOwner {
        if (
            lpWallet_ == address(0) ||
            reserveWallet_ == address(0) ||
            teamWallet_ == address(0)
        ) {
            revert ZeroAddress();
        }
        lpWallet = lpWallet_;
        reserveWallet = reserveWallet_;
        teamWallet = teamWallet_;

        emit WalletsUpdated(lpWallet_, reserveWallet_, teamWallet_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Computes dynamic per-wallet cap unlocked by on-chain validReferrals:
     *         - Tier 0 (Mini):  min(2 + validReferrals * 2, 20)
     *         - Tier 1 (Pro):   min(1 + validReferrals / 2, 5)
     *         - Tier 2 (Whale): (validReferrals >= 5 || whalePublicOpen) ? 1 : 0
     */
    function getWalletTierLimit(
        uint256 seasonId,
        uint8 tierId,
        address wallet
    ) public view returns (uint16) {
        uint32 refs = validReferrals[seasonId][wallet];
        if (tierId == 0) {
            uint256 limit = 2 + uint256(refs) * 2;
            return limit > 20 ? 20 : uint16(limit);
        }
        if (tierId == 1) {
            uint256 limit = 1 + uint256(refs) / 2;
            return limit > 5 ? 5 : uint16(limit);
        }
        if (tierId == 2) {
            return (refs >= 5 || whalePublicOpen[seasonId]) ? 1 : 0;
        }
        return tiers[seasonId][tierId].maxPerWallet;
    }

    function buyBox(
        uint256 seasonId,
        uint8 tierId,
        uint16 quantity,
        address referrer,
        bytes32[] calldata priorityProof,
        bytes32[] calldata whaleProof
    ) external payable nonReentrant whenNotPaused {
        if (quantity == 0) revert InvalidQuantity();

        SeasonConfig storage season = seasons[seasonId];
        if (!season.exists) revert SeasonNotFound();

        TierConfig storage tier = tiers[seasonId][tierId];
        if (!tier.configured) revert TierNotConfigured();

        _verifyAccess(season, tier.requiresWhaleWhitelist, priorityProof, whaleProof);

        uint32 startIndex = _applyPurchase(seasonId, tierId, quantity, tier);
        uint256 totalPaid = tier.priceWei * uint256(quantity);
        if (msg.value != totalPaid) revert InvalidPayment();

        _recordReferral(seasonId, referrer);
        _distributeBnb(season, totalPaid);

        emit BoxPurchased(seasonId, tierId, msg.sender, quantity, startIndex, totalPaid);
    }

    function _applyPurchase(
        uint256 seasonId,
        uint8 tierId,
        uint16 quantity,
        TierConfig storage tier
    ) internal returns (uint32 startIndex) {
        startIndex = tier.sold;
        uint32 newSold = startIndex + uint32(quantity);
        if (newSold > tier.maxSupply) revert ExceedsTierSupply();

        uint16 dynamicLimit = getWalletTierLimit(seasonId, tierId, msg.sender);
        uint16 newWalletCount = walletPurchased[seasonId][tierId][msg.sender] + quantity;
        if (newWalletCount > dynamicLimit) revert ExceedsWalletLimit();

        tier.sold = newSold;
        walletPurchased[seasonId][tierId][msg.sender] = newWalletCount;
    }

    function _recordReferral(uint256 seasonId, address referrer) internal {
        if (!hasPurchasedInSeason[seasonId][msg.sender]) {
            hasPurchasedInSeason[seasonId][msg.sender] = true;
            if (referrer != address(0) && referrer != msg.sender) {
                uint32 newRefCount = validReferrals[seasonId][referrer] + 1;
                validReferrals[seasonId][referrer] = newRefCount;
                emit ReferralRecorded(seasonId, referrer, msg.sender, newRefCount);
            }
        }
    }

    function _verifyAccess(
        SeasonConfig storage season,
        bool requiresWhaleWhitelist,
        bytes32[] calldata priorityProof,
        bytes32[] calldata whaleProof
    ) internal view {
        uint256 ts = block.timestamp;
        if (ts < season.priorityStartAt) revert SaleNotStarted();
        if (ts >= season.endAt) revert SaleEnded();

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));

        // Priority window check (before publicStartAt)
        if (ts < season.publicStartAt) {
            if (
                season.priorityMerkleRoot == bytes32(0) ||
                !MerkleProof.verifyCalldata(priorityProof, season.priorityMerkleRoot, leaf)
            ) {
                revert InvalidPriorityProof();
            }
        }

        // Optional Whale Merkle check (disabled in Season 1 where referral unlock governs Tier 2)
        if (requiresWhaleWhitelist) {
            if (
                season.whaleWhitelistRoot == bytes32(0) ||
                !MerkleProof.verifyCalldata(whaleProof, season.whaleWhitelistRoot, leaf)
            ) {
                revert InvalidWhaleProof();
            }
        }
    }

    function _distributeBnb(SeasonConfig storage season, uint256 totalPaid) internal {
        uint256 lpAmount = (totalPaid * season.lpBps) / BPS_DENOMINATOR;
        uint256 reserveAmount = (totalPaid * season.reserveBps) / BPS_DENOMINATOR;
        uint256 teamAmount = totalPaid - lpAmount - reserveAmount;

        if (lpAmount > 0) _sendBnb(lpWallet, lpAmount);
        if (reserveAmount > 0) _sendBnb(reserveWallet, reserveAmount);
        if (teamAmount > 0) _sendBnb(teamWallet, teamAmount);
    }

    function _sendBnb(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert BnbTransferFailed();
    }

    receive() external payable {
        revert DirectBnbNotAccepted();
    }
}
