import { getAddress, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { buildPopClaimDomain, POP_CLAIM_EIP712_TYPES } from '@pop-box/shared';

export interface SignClaimInput {
  recipient: string;
  amountPop: string; // decimal string in whole POP (e.g., "1234.5")
  nonce: bigint;
  deadlineUnix: number;
  chainId: number;
  verifyingContract: `0x${string}`;
  signerPrivateKey: `0x${string}`;
}

export async function signPopClaimVoucher(input: SignClaimInput): Promise<{
  signature: `0x${string}`;
  amountWei: bigint;
  recipient: `0x${string}`;
}> {
  const account = privateKeyToAccount(input.signerPrivateKey);
  const recipient = getAddress(input.recipient);
  const amountWei = parseEther(input.amountPop);

  const signature = await account.signTypedData({
    domain: buildPopClaimDomain(input.chainId, input.verifyingContract),
    types: POP_CLAIM_EIP712_TYPES,
    primaryType: 'Claim',
    message: {
      recipient,
      amount: amountWei,
      nonce: input.nonce,
      deadline: BigInt(input.deadlineUnix),
    },
  });

  return { signature, amountWei, recipient };
}
