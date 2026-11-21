export const POP_CLAIM_EIP712_DOMAIN_NAME = 'PopClaimVault' as const;
export const POP_CLAIM_EIP712_DOMAIN_VERSION = '1' as const;

export const POP_CLAIM_EIP712_TYPES = {
  Claim: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface PopClaimTypedMessage {
  recipient: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
}

export function buildPopClaimDomain(chainId: number, verifyingContract: `0x${string}`) {
  return {
    name: POP_CLAIM_EIP712_DOMAIN_NAME,
    version: POP_CLAIM_EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}
