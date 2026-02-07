import { expect } from "chai";
import { ethers } from "hardhat";
import { FlareGateEscrow } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("FlareGateEscrow", function () {
  let escrow: FlareGateEscrow;
  let owner: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let provider: HardhatEthersSigner;
  let feeRecipient: HardhatEthersSigner;

  const PRICE = ethers.parseEther("0.1"); // 0.1 C2FLR
  const TIMEOUT = 300; // 5 minutes
  const ENDPOINT = "/weather";

  beforeEach(async function () {
    [owner, agent, provider, feeRecipient] = await ethers.getSigners();
    const FlareGateEscrow = await ethers.getContractFactory("FlareGateEscrow");
    escrow = await FlareGateEscrow.deploy(feeRecipient.address);
    await escrow.waitForDeployment();
  });

  describe("createEscrow", function () {
    it("should create an escrow with correct parameters", async function () {
      const tx = await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const receipt = await tx.wait();
      const e = await escrow.getEscrow(1);

      expect(e.id).to.equal(1);
      expect(e.agent).to.equal(agent.address);
      expect(e.provider).to.equal(provider.address);
      expect(e.amount).to.equal(PRICE);
      expect(e.endpoint).to.equal(ENDPOINT);
      expect(e.state).to.equal(0); // Created
      expect(e.timeout).to.equal(TIMEOUT);
    });

    it("should emit EscrowCreated event", async function () {
      await expect(
        escrow.connect(agent).createEscrow(provider.address, ENDPOINT, TIMEOUT, {
          value: PRICE,
        })
      )
        .to.emit(escrow, "EscrowCreated")
        .withArgs(1, agent.address, provider.address, PRICE, ENDPOINT);
    });

    it("should reject zero value", async function () {
      await expect(
        escrow.connect(agent).createEscrow(provider.address, ENDPOINT, TIMEOUT, {
          value: 0,
        })
      ).to.be.revertedWith("Must deposit funds");
    });

    it("should reject zero address provider", async function () {
      await expect(
        escrow.connect(agent).createEscrow(ethers.ZeroAddress, ENDPOINT, TIMEOUT, {
          value: PRICE,
        })
      ).to.be.revertedWith("Invalid provider");
    });

    it("should increment escrow IDs", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const e1 = await escrow.getEscrow(1);
      const e2 = await escrow.getEscrow(2);
      expect(e1.id).to.equal(1);
      expect(e2.id).to.equal(2);
    });
  });

  describe("Happy path: create → deliver → confirm", function () {
    let escrowId: number;

    beforeEach(async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });
      escrowId = 1;
    });

    it("should complete full lifecycle with matching hashes", async function () {
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("weather data"));

      // Provider confirms delivery
      await expect(escrow.connect(provider).confirmDelivery(escrowId, dataHash))
        .to.emit(escrow, "DeliveryConfirmed")
        .withArgs(escrowId, dataHash);

      let e = await escrow.getEscrow(escrowId);
      expect(e.state).to.equal(1); // Delivered
      expect(e.deliveryHash).to.equal(dataHash);

      // Track provider balance before confirmation
      const providerBalBefore = await ethers.provider.getBalance(provider.address);
      const feeBalBefore = await ethers.provider.getBalance(feeRecipient.address);

      // Agent confirms receipt with matching hash
      const tx = await escrow.connect(agent).confirmReceived(escrowId, dataHash);
      const receipt = await tx.wait();

      e = await escrow.getEscrow(escrowId);
      expect(e.state).to.equal(2); // Completed
      expect(e.receiptHash).to.equal(dataHash);

      // Verify funds released (provider gets 99%, fee recipient gets 1%)
      const expectedFee = PRICE / 100n;
      const expectedPayout = PRICE - expectedFee;

      const providerBalAfter = await ethers.provider.getBalance(provider.address);
      const feeBalAfter = await ethers.provider.getBalance(feeRecipient.address);

      expect(providerBalAfter - providerBalBefore).to.equal(expectedPayout);
      expect(feeBalAfter - feeBalBefore).to.equal(expectedFee);
    });
  });

  describe("Hash mismatch → dispute", function () {
    it("should raise dispute when hashes don't match", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const deliveryHash = ethers.keccak256(ethers.toUtf8Bytes("original data"));
      const receiptHash = ethers.keccak256(ethers.toUtf8Bytes("tampered data"));

      await escrow.connect(provider).confirmDelivery(1, deliveryHash);

      await expect(escrow.connect(agent).confirmReceived(1, receiptHash))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(1, deliveryHash, receiptHash);

      const e = await escrow.getEscrow(1);
      expect(e.state).to.equal(3); // Disputed
    });
  });

  describe("Timeout claim", function () {
    it("should allow provider to claim after timeout", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await escrow.connect(provider).confirmDelivery(1, dataHash);

      // Fast-forward past timeout
      await time.increase(TIMEOUT + 1);

      await expect(escrow.connect(provider).claimTimeout(1))
        .to.emit(escrow, "TimeoutClaimed")
        .withArgs(1);

      const e = await escrow.getEscrow(1);
      expect(e.state).to.equal(5); // Claimed
    });

    it("should reject claim before timeout", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await escrow.connect(provider).confirmDelivery(1, dataHash);

      await expect(escrow.connect(provider).claimTimeout(1)).to.be.revertedWith(
        "Timeout not reached"
      );
    });
  });

  describe("Refund", function () {
    it("should allow agent to refund after timeout if no delivery", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      await time.increase(TIMEOUT + 1);

      const agentBalBefore = await ethers.provider.getBalance(agent.address);
      const tx = await escrow.connect(agent).refund(1);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const agentBalAfter = await ethers.provider.getBalance(agent.address);
      expect(agentBalAfter - agentBalBefore + gasCost).to.equal(PRICE);

      const e = await escrow.getEscrow(1);
      expect(e.state).to.equal(4); // Refunded
    });

    it("should reject refund before timeout", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      await expect(escrow.connect(agent).refund(1)).to.be.revertedWith(
        "Timeout not reached"
      );
    });
  });

  describe("Access control", function () {
    beforeEach(async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });
    });

    it("should reject delivery from non-provider", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await expect(
        escrow.connect(agent).confirmDelivery(1, hash)
      ).to.be.revertedWith("Only provider can confirm delivery");
    });

    it("should reject receipt from non-agent", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await escrow.connect(provider).confirmDelivery(1, hash);
      await expect(
        escrow.connect(provider).confirmReceived(1, hash)
      ).to.be.revertedWith("Only agent can confirm receipt");
    });

    it("should reject timeout claim from non-provider", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await escrow.connect(provider).confirmDelivery(1, hash);
      await time.increase(TIMEOUT + 1);
      await expect(escrow.connect(agent).claimTimeout(1)).to.be.revertedWith(
        "Only provider can claim timeout"
      );
    });

    it("should reject refund from non-agent", async function () {
      await time.increase(TIMEOUT + 1);
      await expect(escrow.connect(provider).refund(1)).to.be.revertedWith(
        "Only agent can request refund"
      );
    });
  });

  describe("Fee calculation", function () {
    it("should deduct 1% fee on completion", async function () {
      const amount = ethers.parseEther("1.0");
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: amount });

      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await escrow.connect(provider).confirmDelivery(1, hash);

      const feeBalBefore = await ethers.provider.getBalance(feeRecipient.address);
      await escrow.connect(agent).confirmReceived(1, hash);
      const feeBalAfter = await ethers.provider.getBalance(feeRecipient.address);

      const expectedFee = amount / 100n; // 1%
      expect(feeBalAfter - feeBalBefore).to.equal(expectedFee);
    });
  });

  describe("View functions", function () {
    it("should return escrow IDs by agent", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const ids = await escrow.getEscrowsByAgent(agent.address);
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal(1);
      expect(ids[1]).to.equal(2);
    });

    it("should return escrow IDs by provider", async function () {
      await escrow
        .connect(agent)
        .createEscrow(provider.address, ENDPOINT, TIMEOUT, { value: PRICE });

      const ids = await escrow.getEscrowsByProvider(provider.address);
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(1);
    });

    it("should revert for non-existent escrow", async function () {
      await expect(escrow.getEscrow(999)).to.be.revertedWith(
        "Escrow does not exist"
      );
    });
  });

  describe("Pausable", function () {
    it("should prevent creating escrows when paused", async function () {
      await escrow.connect(owner).pause();
      await expect(
        escrow.connect(agent).createEscrow(provider.address, ENDPOINT, TIMEOUT, {
          value: PRICE,
        })
      ).to.be.reverted;
    });

    it("should allow creating escrows after unpause", async function () {
      await escrow.connect(owner).pause();
      await escrow.connect(owner).unpause();
      await expect(
        escrow.connect(agent).createEscrow(provider.address, ENDPOINT, TIMEOUT, {
          value: PRICE,
        })
      ).to.not.be.reverted;
    });
  });
});
