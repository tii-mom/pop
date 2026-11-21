import { parseAbi } from 'viem';

export const POP_PRIMARY_SALE_ADDRESS = (import.meta.env.VITE_POP_PRIMARY_SALE_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const POP_CLAIM_VAULT_ADDRESS = (import.meta.env.VITE_POP_CLAIM_VAULT_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const POP_PRIMARY_SALE_ABI = parseAbi([
  'function buyBox(uint256 seasonId, uint8 tierId, uint16 quantity, address referrer, bytes32[] priorityProof, bytes32[] whaleProof) payable',
  'function validReferrals(uint256 seasonId, address wallet) view returns (uint32)',
  'function whalePublicOpen(uint256 seasonId) view returns (bool)',
  'function getWalletTierLimit(uint256 seasonId, uint8 tierId, address wallet) view returns (uint16)',
  'function walletPurchased(uint256 seasonId, uint8 tierId, address wallet) view returns (uint16)',
]);

export const POP_CLAIM_VAULT_ABI = parseAbi([
  'function claim(uint256 amount, uint256 deadline, bytes signature)',
]);
