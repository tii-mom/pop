import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

class SimpleMerkleTree {
  private layers: string[][];

  constructor(addresses: string[]) {
    if (addresses.length === 0) {
      throw new Error("Empty address list");
    }
    const leaves = addresses
      .map((addr) => ethers.solidityPackedKeccak256(["address"], [addr]))
      .sort();

    this.layers = [leaves];
    while (this.layers[this.layers.length - 1].length > 1) {
      const prev = this.layers[this.layers.length - 1];
      const next: string[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        if (i + 1 === prev.length) {
          next.push(prev[i]);
        } else {
          next.push(SimpleMerkleTree.hashPair(prev[i], prev[i + 1]));
        }
      }
      this.layers.push(next);
    }
  }

  private static hashPair(a: string, b: string): string {
    return a.toLowerCase() < b.toLowerCase()
      ? ethers.keccak256(ethers.concat([a, b]))
      : ethers.keccak256(ethers.concat([b, a]));
  }

  getRoot(): string {
    return this.layers[this.layers.length - 1][0];
  }

  getProof(address: string): string[] {
    const leaf = ethers.solidityPackedKeccak256(["address"], [address]);
    let idx = this.layers[0].indexOf(leaf);
    if (idx === -1) return [];

    const proof: string[] = [];
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
}

describe("POP Box ($POP) Smart Contracts", function () {
  let owner: HardhatEthersSigner;
  let lpWallet: HardhatEthersSigner;
  let teamWallet: HardhatEthersSigner;
  let marketingWallet: HardhatEthersSigner;
  let ecosystemWallet: HardhatEthersSigner;
  let reserveWallet: HardhatEthersSigner;
  let claimSigner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let whaleUser: HardhatEthersSigner;
  let extraSigners: HardhatEthersSigner[];

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [
      owner,
      lpWallet,
      teamWallet,
      marketingWallet,
      ecosystemWallet,
      reserveWallet,
      claimSigner,
      alice,
      bob,
      whaleUser,
      ...extraSigners
    ] = signers;
  });

  describe("PopToken", function () {
    it("mints exact 1B fixed supply with 10%/20%/10%/60% allocation, 0% tax, and burnable", async function () {
      const PopToken = await ethers.getContractFactory("PopToken");
      const token = await PopToken.deploy(
        lpWallet.address,
        teamWallet.address,
        marketingWallet.address,
        ecosystemWallet.address
      );

      expect(await token.name()).to.equal("POP Box");
      expect(await token.symbol()).to.equal("POP");
      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000000"));
      expect(await token.balanceOf(lpWallet.address)).to.equal(ethers.parseEther("100000000"));
      expect(await token.balanceOf(teamWallet.address)).to.equal(ethers.parseEther("200000000"));
      expect(await token.balanceOf(marketingWallet.address)).to.equal(ethers.parseEther("100000000"));
      expect(await token.balanceOf(ecosystemWallet.address)).to.equal(ethers.parseEther("600000000"));

      const transferAmt = ethers.parseEther("1000");
      await token.connect(marketingWallet).transfer(alice.address, transferAmt);
      expect(await token.balanceOf(alice.address)).to.equal(transferAmt);

      await token.connect(alice).burn(ethers.parseEther("400"));
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("600"));
      expect(await token.totalSupply()).to.equal(ethers.parseEther("999999600"));
    });

    it("reverts if any allocation wallet is zero address", async function () {
      const PopToken = await ethers.getContractFactory("PopToken");
      await expect(
        PopToken.deploy(
          ethers.ZeroAddress,
          teamWallet.address,
          marketingWallet.address,
          ecosystemWallet.address
        )
      ).to.be.revertedWithCustomError(PopToken, "ZeroAddress");
    });
  });

  describe("PopPrimarySale", function () {
    let sale: any;
    let priorityTree: SimpleMerkleTree;
    let priorityStart: number;
    let publicStart: number;
    let endAt: number;
    const poolCommitHash = ethers.keccak256(ethers.toUtf8Bytes("season1-pool-json:salt"));

    beforeEach(async function () {
      const PopPrimarySale = await ethers.getContractFactory("PopPrimarySale");
      sale = await PopPrimarySale.deploy(
        owner.address,
        lpWallet.address,
        reserveWallet.address,
        teamWallet.address
      );

      priorityTree = new SimpleMerkleTree([alice.address, whaleUser.address]);

      const now = await time.latest();
      priorityStart = now + 100;
      publicStart = priorityStart + 1800; // 30 minutes priority window
      endAt = publicStart + 86400;

      // Season 1: 80% LP / 0% Reserve / 20% Team
      await sale
        .connect(owner)
        .createSeason(
          1,
          priorityStart,
          publicStart,
          endAt,
          8000,
          0,
          2000,
          poolCommitHash,
          priorityTree.getRoot(),
          ethers.ZeroHash
        );

      // Season 1 updated supply: 2,500 Mini / 500 Pro / 25 Whale (referral-unlocked)
      await sale.connect(owner).configureTier(1, 0, ethers.parseEther("0.01"), 2500, 20, false);
      await sale.connect(owner).configureTier(1, 1, ethers.parseEther("0.1"), 500, 5, false);
      await sale.connect(owner).configureTier(1, 2, ethers.parseEther("1.0"), 25, 1, false);
    });

    it("rejects invalid BPS splits and direct BNB transfers", async function () {
      await expect(
        sale
          .connect(owner)
          .createSeason(2, priorityStart, publicStart, endAt, 5000, 3000, 1000, poolCommitHash, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(sale, "InvalidBpsSplit");

      await expect(
        alice.sendTransaction({ to: await sale.getAddress(), value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(sale, "DirectBnbNotAccepted");
    });

    it("enforces priority Merkle proof during priority window and opens during public window", async function () {
      await time.increaseTo(priorityStart + 10);

      await expect(
        sale.connect(bob).buyBox(1, 0, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(sale, "InvalidPriorityProof");

      const aliceProof = priorityTree.getProof(alice.address);
      await expect(
        sale.connect(alice).buyBox(1, 0, 2, ethers.ZeroAddress, aliceProof, [], { value: ethers.parseEther("0.02") })
      )
        .to.emit(sale, "BoxPurchased")
        .withArgs(1, 0, alice.address, 2, 0, ethers.parseEther("0.02"));

      await time.increaseTo(publicStart + 10);
      await expect(
        sale.connect(bob).buyBox(1, 0, 2, alice.address, [], [], { value: ethers.parseEther("0.02") })
      )
        .to.emit(sale, "BoxPurchased")
        .withArgs(1, 0, bob.address, 2, 2, ethers.parseEther("0.02"));
    });

    it("unlocks dynamic Mini/Pro/Whale wallet caps via on-chain validReferrals and supports setWhalePublicOpen fallback", async function () {
      await time.increaseTo(publicStart + 10);

      // Baseline with 0 referrals: Mini=2, Pro=1, Whale=0
      expect(await sale.getWalletTierLimit(1, 0, alice.address)).to.equal(2);
      expect(await sale.getWalletTierLimit(1, 1, alice.address)).to.equal(1);
      expect(await sale.getWalletTierLimit(1, 2, alice.address)).to.equal(0);

      // Alice cannot buy Whale with 0 referrals
      await expect(
        sale.connect(alice).buyBox(1, 2, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("1.0") })
      ).to.be.revertedWithCustomError(sale, "ExceedsWalletLimit");

      // Self-referral does not increment validReferrals
      await sale.connect(alice).buyBox(1, 0, 2, alice.address, [], [], { value: ethers.parseEther("0.02") });
      expect(await sale.validReferrals(1, alice.address)).to.equal(0);

      // Alice tries 3rd Mini box -> ExceedsWalletLimit (cap is still 2)
      await expect(
        sale.connect(alice).buyBox(1, 0, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(sale, "ExceedsWalletLimit");

      // 5 distinct friends make their first purchase referring Alice
      const friends = [bob, whaleUser, extraSigners[0], extraSigners[1], extraSigners[2]];
      for (const friend of friends) {
        await sale.connect(friend).buyBox(1, 0, 1, alice.address, [], [], { value: ethers.parseEther("0.01") });
      }
      // Second purchase by bob should NOT double-count referral
      await sale.connect(bob).buyBox(1, 0, 1, alice.address, [], [], { value: ethers.parseEther("0.01") });

      expect(await sale.validReferrals(1, alice.address)).to.equal(5);
      // With 5 referrals: Mini = min(2 + 10, 20) = 12, Pro = min(1 + 2, 5) = 3, Whale = 1
      expect(await sale.getWalletTierLimit(1, 0, alice.address)).to.equal(12);
      expect(await sale.getWalletTierLimit(1, 1, alice.address)).to.equal(3);
      expect(await sale.getWalletTierLimit(1, 2, alice.address)).to.equal(1);

      // Alice can now buy 1 Whale box
      await expect(
        sale.connect(alice).buyBox(1, 2, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("1.0") })
      )
        .to.emit(sale, "BoxPurchased")
        .withArgs(1, 2, alice.address, 1, 0, ethers.parseEther("1.0"));

      // Bob (0 referrals) still blocked on Whale until owner enables setWhalePublicOpen(1, true)
      await expect(
        sale.connect(bob).buyBox(1, 2, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("1.0") })
      ).to.be.revertedWithCustomError(sale, "ExceedsWalletLimit");

      await sale.connect(owner).setWhalePublicOpen(1, true);
      expect(await sale.getWalletTierLimit(1, 2, bob.address)).to.equal(1);
      await expect(
        sale.connect(bob).buyBox(1, 2, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("1.0") })
      ).to.emit(sale, "BoxPurchased");
    });

    it("intercepts tier oversell hard cap", async function () {
      const now = await time.latest();
      await sale.connect(owner).createSeason(99, now, now, now + 86400, 8000, 0, 2000, poolCommitHash, ethers.ZeroHash, ethers.ZeroHash);
      await sale.connect(owner).configureTier(99, 0, ethers.parseEther("0.01"), 3, 20, false);

      await sale.connect(alice).buyBox(99, 0, 2, ethers.ZeroAddress, [], [], { value: ethers.parseEther("0.02") });
      await expect(
        sale.connect(bob).buyBox(99, 0, 2, ethers.ZeroAddress, [], [], { value: ethers.parseEther("0.02") })
      ).to.be.revertedWithCustomError(sale, "ExceedsTierSupply");
    });

    it("forwards BNB instantaneously with 0 BNB left in contract across Season 1, Season 2, and Season 4 splits", async function () {
      await time.increaseTo(publicStart + 10);
      await sale.connect(owner).setWhalePublicOpen(1, true);

      // Season 1 (80% LP / 0% Reserve / 20% Team)
      const lpBefore1 = await ethers.provider.getBalance(lpWallet.address);
      const resBefore1 = await ethers.provider.getBalance(reserveWallet.address);
      const teamBefore1 = await ethers.provider.getBalance(teamWallet.address);

      await sale.connect(whaleUser).buyBox(1, 2, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("1.0") });

      expect((await ethers.provider.getBalance(lpWallet.address)) - lpBefore1).to.equal(ethers.parseEther("0.8"));
      expect((await ethers.provider.getBalance(reserveWallet.address)) - resBefore1).to.equal(0n);
      expect((await ethers.provider.getBalance(teamWallet.address)) - teamBefore1).to.equal(ethers.parseEther("0.2"));
      expect(await ethers.provider.getBalance(await sale.getAddress())).to.equal(0n);

      // Season 2 (10% LP / 55% Reserve / 35% Team)
      const now = await time.latest();
      await sale.connect(owner).createSeason(2, now, now, now + 86400, 1000, 5500, 3500, poolCommitHash, ethers.ZeroHash, ethers.ZeroHash);
      await sale.connect(owner).configureTier(2, 1, ethers.parseEther("0.1"), 100, 5, false);

      const lpBefore2 = await ethers.provider.getBalance(lpWallet.address);
      const resBefore2 = await ethers.provider.getBalance(reserveWallet.address);
      const teamBefore2 = await ethers.provider.getBalance(teamWallet.address);

      await sale.connect(alice).buyBox(2, 1, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("0.1") });

      expect((await ethers.provider.getBalance(lpWallet.address)) - lpBefore2).to.equal(ethers.parseEther("0.01"));
      expect((await ethers.provider.getBalance(reserveWallet.address)) - resBefore2).to.equal(ethers.parseEther("0.055"));
      expect((await ethers.provider.getBalance(teamWallet.address)) - teamBefore2).to.equal(ethers.parseEther("0.035"));
      expect(await ethers.provider.getBalance(await sale.getAddress())).to.equal(0n);

      // Season 4 (0% LP / 60% Reserve / 40% Team)
      await sale.connect(owner).createSeason(4, now, now, now + 86400, 0, 6000, 4000, poolCommitHash, ethers.ZeroHash, ethers.ZeroHash);
      await sale.connect(owner).configureTier(4, 1, ethers.parseEther("0.1"), 100, 5, false);

      const lpBefore4 = await ethers.provider.getBalance(lpWallet.address);
      const resBefore4 = await ethers.provider.getBalance(reserveWallet.address);
      const teamBefore4 = await ethers.provider.getBalance(teamWallet.address);

      await sale.connect(bob).buyBox(4, 1, 1, ethers.ZeroAddress, [], [], { value: ethers.parseEther("0.1") });

      expect((await ethers.provider.getBalance(lpWallet.address)) - lpBefore4).to.equal(0n);
      expect((await ethers.provider.getBalance(reserveWallet.address)) - resBefore4).to.equal(ethers.parseEther("0.06"));
      expect((await ethers.provider.getBalance(teamWallet.address)) - teamBefore4).to.equal(ethers.parseEther("0.04"));
      expect(await ethers.provider.getBalance(await sale.getAddress())).to.equal(0n);
    });
  });

  describe("PopClaimVault", function () {
    let token: any;
    let vault: any;
    const maxPerTx = ethers.parseEther("100000");
    const dailyLimit = ethers.parseEther("150000");

    async function signClaim(
      signer: HardhatEthersSigner,
      vaultAddr: string,
      recipient: string,
      amount: bigint,
      nonce: bigint,
      deadline: number
    ): Promise<string> {
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const domain = {
        name: "PopClaimVault",
        version: "1",
        chainId,
        verifyingContract: vaultAddr,
      };
      const types = {
        Claim: [
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      return signer.signTypedData(domain, types, { recipient, amount, nonce, deadline });
    }

    beforeEach(async function () {
      const PopToken = await ethers.getContractFactory("PopToken");
      token = await PopToken.deploy(
        lpWallet.address,
        teamWallet.address,
        marketingWallet.address,
        ecosystemWallet.address
      );

      const PopClaimVault = await ethers.getContractFactory("PopClaimVault");
      vault = await PopClaimVault.deploy(
        owner.address,
        await token.getAddress(),
        claimSigner.address,
        maxPerTx,
        dailyLimit
      );

      await token.connect(ecosystemWallet).transfer(await vault.getAddress(), ethers.parseEther("60000000"));
    });

    it("verifies EIP-712 signature, transfers $POP, increments nonce, and blocks replay attacks", async function () {
      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("50000");
      const deadline = (await time.latest()) + 900;
      const sig = await signClaim(claimSigner, vaultAddr, alice.address, amount, 0n, deadline);

      await expect(vault.connect(alice).claim(amount, deadline, sig))
        .to.emit(vault, "PopClaimed")
        .withArgs(alice.address, amount, 0n);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await vault.nonces(alice.address)).to.equal(1n);

      await expect(vault.connect(alice).claim(amount, deadline, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSignature"
      );

      await expect(vault.connect(bob).claim(amount, deadline, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSignature"
      );
    });

    it("rejects expired signatures and invalid signers", async function () {
      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("10000");
      const pastDeadline = (await time.latest()) - 10;
      const expiredSig = await signClaim(claimSigner, vaultAddr, alice.address, amount, 0n, pastDeadline);

      await expect(
        vault.connect(alice).claim(amount, pastDeadline, expiredSig)
      ).to.be.revertedWithCustomError(vault, "SignatureExpired");

      const futureDeadline = (await time.latest()) + 900;
      const wrongSignerSig = await signClaim(bob, vaultAddr, alice.address, amount, 0n, futureDeadline);
      await expect(
        vault.connect(alice).claim(amount, futureDeadline, wrongSignerSig)
      ).to.be.revertedWithCustomError(vault, "InvalidSignature");
    });

    it("enforces maxClaimPerTx and dailyClaimLimit circuit breakers and resets next UTC day", async function () {
      const vaultAddr = await vault.getAddress();
      const deadline = (await time.latest()) + 100000;

      const overPerTx = ethers.parseEther("100001");
      const sigOverPerTx = await signClaim(claimSigner, vaultAddr, alice.address, overPerTx, 0n, deadline);
      await expect(
        vault.connect(alice).claim(overPerTx, deadline, sigOverPerTx)
      ).to.be.revertedWithCustomError(vault, "ExceedsMaxClaimPerTx");

      const amt1 = ethers.parseEther("90000");
      const sig1 = await signClaim(claimSigner, vaultAddr, alice.address, amt1, 0n, deadline);
      await vault.connect(alice).claim(amt1, deadline, sig1);

      const amt2 = ethers.parseEther("70000");
      const sig2 = await signClaim(claimSigner, vaultAddr, bob.address, amt2, 0n, deadline);
      await expect(
        vault.connect(bob).claim(amt2, deadline, sig2)
      ).to.be.revertedWithCustomError(vault, "ExceedsDailyClaimLimit");

      await time.increase(86400);
      await expect(vault.connect(bob).claim(amt2, deadline, sig2))
        .to.emit(vault, "PopClaimed")
        .withArgs(bob.address, amt2, 0n);
      expect(await token.balanceOf(bob.address)).to.equal(amt2);
    });

    it("supports pause/unpause and paused emergencyWithdraw", async function () {
      await vault.connect(owner).pause();

      const vaultAddr = await vault.getAddress();
      const amount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 900;
      const sig = await signClaim(claimSigner, vaultAddr, alice.address, amount, 0n, deadline);

      await expect(vault.connect(alice).claim(amount, deadline, sig)).to.be.revertedWithCustomError(
        vault,
        "EnforcedPause"
      );

      await expect(vault.connect(owner).emergencyWithdraw(teamWallet.address, amount))
        .to.emit(vault, "EmergencyWithdraw")
        .withArgs(teamWallet.address, amount);

      await vault.connect(owner).unpause();
      await expect(vault.connect(alice).claim(amount, deadline, sig)).to.emit(vault, "PopClaimed");
    });
  });
});
