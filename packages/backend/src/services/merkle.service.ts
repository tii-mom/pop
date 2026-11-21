import { concatHex, encodePacked, getAddress, keccak256, zeroHash } from 'viem';

/**
 * OpenZeppelin MerkleProof-compatible sorted-pair Merkle tree.
 * Leaf format: keccak256(abi.encodePacked(address)) — exact match with PopPrimarySale.sol.
 */
export class AddressMerkleTree {
  private readonly layers: `0x${string}`[][];

  constructor(addresses: string[]) {
    const uniqueNormalized = Array.from(
      new Set(addresses.map((a) => getAddress(a)))
    );

    if (uniqueNormalized.length === 0) {
      this.layers = [[zeroHash]];
      return;
    }

    const leaves = uniqueNormalized
      .map((addr) => AddressMerkleTree.hashLeaf(addr))
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));

    this.layers = [leaves];

    while (this.layers[this.layers.length - 1].length > 1) {
      const prev = this.layers[this.layers.length - 1];
      const next: `0x${string}`[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        if (i + 1 === prev.length) {
          next.push(prev[i]);
        } else {
          next.push(AddressMerkleTree.hashPair(prev[i], prev[i + 1]));
        }
      }
      this.layers.push(next);
    }
  }

  static hashLeaf(address: string): `0x${string}` {
    return keccak256(encodePacked(['address'], [getAddress(address)]));
  }

  static hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
    return a.toLowerCase() < b.toLowerCase()
      ? keccak256(concatHex([a, b]))
      : keccak256(concatHex([b, a]));
  }

  getRoot(): `0x${string}` {
    return this.layers[this.layers.length - 1][0];
  }

  getProof(address: string): `0x${string}`[] {
    const leaf = AddressMerkleTree.hashLeaf(address);
    let idx = this.layers[0].indexOf(leaf);
    if (idx === -1) return [];

    const proof: `0x${string}`[] = [];
    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const layer = this.layers[layerIdx];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (siblingIdx < layer.length) {
        proof.push(layer[siblingIdx]);
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  static verify(address: string, proof: `0x${string}`[], root: `0x${string}`): boolean {
    if (root === zeroHash) return false;
    let computed = AddressMerkleTree.hashLeaf(address);
    for (const sibling of proof) {
      computed = AddressMerkleTree.hashPair(computed, sibling);
    }
    return computed.toLowerCase() === root.toLowerCase();
  }
}
