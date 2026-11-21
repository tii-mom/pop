import { parseAbi } from 'viem';

export const POP_PRIMARY_SALE_ABI = parseAbi([
  'event BoxPurchased(uint256 indexed seasonId, uint8 indexed tierId, address indexed buyer, uint16 quantity, uint32 startIndex, uint256 totalPaid)',
  'function tiers(uint256 seasonId, uint8 tierId) view returns (bool configured, uint256 priceWei, uint32 maxSupply, uint32 sold, uint16 maxPerWallet, bool requiresWhaleWhitelist)',
  'function seasons(uint256 seasonId) view returns (bool exists, uint64 priorityStartAt, uint64 publicStartAt, uint64 endAt, uint16 lpBps, uint16 reserveBps, uint16 teamBps, bytes32 poolCommitHash, bytes32 priorityMerkleRoot, bytes32 whaleWhitelistRoot)',
]);

export const POP_CLAIM_VAULT_ABI = parseAbi([
  'event PopClaimed(address indexed recipient, uint256 amount, uint256 nonce)',
  'function nonces(address user) view returns (uint256)',
  'function maxClaimPerTx() view returns (uint256)',
  'function dailyClaimLimit() view returns (uint256)',
]);

export const PANCAKE_V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]);

export const PANCAKE_V3_NPM_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
]);
