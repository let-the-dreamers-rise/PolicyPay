import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Policypay } from "../target/types/policypay";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";

describe("policypay", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Policypay as Program<Policypay>;

  const admin = provider.wallet as anchor.Wallet;
  const complianceIssuer = Keypair.generate();
  const institution = Keypair.generate();
  const sender = Keypair.generate();
  const recipient = Keypair.generate();

  let usdcMint: PublicKey;
  let senderTokenAccount: PublicKey;
  let recipientTokenAccount: PublicKey;
  let configPda: PublicKey;
  let policyPda: PublicKey;

  const POLICY_ID = new anchor.BN(1);
  const MAX_AMOUNT = new anchor.BN(1_000_000);
  const AML_THRESHOLD = 50;
  const BLOCKED_COUNTRIES = [100, 101, 0, 0, 0, 0, 0, 0, 0, 0]; // 100 = IR, 101 = KP
  const TRAVEL_RULE_REQUIRED = true;
  const TRAVEL_RULE_REQUIRED_AMOUNT = new anchor.BN(10_000);

  function computePayloadHash(
    kycVerified: boolean,
    amlScore: number,
    senderVaspId: Buffer,
    receiverVaspId: Buffer,
    travelRuleFieldsPresent: boolean,
    travelRulePayloadVersion: number,
  ): Buffer {
    const data = Buffer.alloc(68);
    let offset = 0;
    data.writeUInt8(kycVerified ? 1 : 0, offset++);
    data.writeUInt8(amlScore, offset++);
    senderVaspId.copy(data, offset);
    offset += 32;
    receiverVaspId.copy(data, offset);
    offset += 32;
    data.writeUInt8(travelRuleFieldsPresent ? 1 : 0, offset++);
    data.writeUInt8(travelRulePayloadVersion, offset++);
    return createHash("sha256").update(data).digest();
  }

  before(async () => {
    const airdrops = [
      provider.connection.requestAirdrop(complianceIssuer.publicKey, 2e9),
      provider.connection.requestAirdrop(institution.publicKey, 2e9),
      provider.connection.requestAirdrop(sender.publicKey, 2e9),
      provider.connection.requestAirdrop(recipient.publicKey, 2e9),
    ];
    const sigs = await Promise.all(airdrops);
    await Promise.all(
      sigs.map((sig) => provider.connection.confirmTransaction(sig)),
    );

    usdcMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      6,
    );

    senderTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      sender.publicKey,
    );

    recipientTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      recipient.publicKey,
    );

    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      senderTokenAccount,
      admin.publicKey,
      10_000_000,
    );

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );

    [policyPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("policy"),
        institution.publicKey.toBuffer(),
        POLICY_ID.toArrayLike(Buffer, "le", 8),
      ],
      program.programId,
    );
  });

  it("Initializes config", async () => {
    await program.methods
      .initializeConfig(complianceIssuer.publicKey, usdcMint)
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.programConfig.fetch(configPda);
    assert.ok(cfg.admin.equals(admin.publicKey));
    assert.ok(cfg.complianceIssuer.equals(complianceIssuer.publicKey));
    assert.ok(cfg.usdcMint.equals(usdcMint));
  });

  it("Creates a policy", async () => {
    await program.methods
      .createPolicy(
        POLICY_ID,
        MAX_AMOUNT,
        true,
        AML_THRESHOLD,
        BLOCKED_COUNTRIES,
        TRAVEL_RULE_REQUIRED,
        TRAVEL_RULE_REQUIRED_AMOUNT,
      )
      .accounts({
        config: configPda,
        policy: policyPda,
        institution: institution.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([institution])
      .rpc();

    const pol = await program.account.policy.fetch(policyPda);
    assert.ok(pol.institution.equals(institution.publicKey));
    assert.equal(pol.maxAmount.toNumber(), MAX_AMOUNT.toNumber());
    assert.equal(pol.amlThreshold, AML_THRESHOLD);
    assert.equal(pol.requireKyc, true);
    assert.equal(pol.travelRuleRequired, true);
  });

  it("Settles a compliant payment", async () => {
    const amount = new anchor.BN(5_000);
    const senderCountry = 1;
    const receiverCountry = 2;
    const kycVerified = true;
    const amlScore = 30;
    const senderVaspId = Buffer.alloc(32, 1);
    const receiverVaspId = Buffer.alloc(32, 2);
    const travelRuleFieldsPresent = true;
    const travelRulePayloadVersion = 1;

    const payloadHash = computePayloadHash(
      kycVerified,
      amlScore,
      senderVaspId,
      receiverVaspId,
      travelRuleFieldsPresent,
      travelRulePayloadVersion,
    );

    const tx = await program.methods
      .settlePayment(
        amount,
        senderCountry,
        receiverCountry,
        kycVerified,
        amlScore,
        Array.from(senderVaspId) as any,
        Array.from(receiverVaspId) as any,
        travelRuleFieldsPresent,
        travelRulePayloadVersion,
        Array.from(payloadHash) as any,
      )
      .accounts({
        config: configPda,
        policy: policyPda,
        complianceIssuer: complianceIssuer.publicKey,
        senderOwner: sender.publicKey,
        senderTokenAccount,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([complianceIssuer, sender])
      .rpc();

    console.log("  Settlement tx:", tx);
  });

  it("Rejects payment when AML score exceeds threshold", async () => {
    const amount = new anchor.BN(5_000);
    const kycVerified = true;
    const amlScore = 72;
    const senderVaspId = Buffer.alloc(32, 1);
    const receiverVaspId = Buffer.alloc(32, 2);

    const payloadHash = computePayloadHash(
      kycVerified,
      amlScore,
      senderVaspId,
      receiverVaspId,
      true,
      1,
    );

    try {
      await program.methods
        .settlePayment(
          amount,
          1,
          2,
          kycVerified,
          amlScore,
          Array.from(senderVaspId) as any,
          Array.from(receiverVaspId) as any,
          true,
          1,
          Array.from(payloadHash) as any,
        )
        .accounts({
          config: configPda,
          policy: policyPda,
          complianceIssuer: complianceIssuer.publicKey,
          senderOwner: sender.publicKey,
          senderTokenAccount,
          recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([complianceIssuer, sender])
        .rpc();
      assert.fail("Should have been rejected");
    } catch (err: any) {
      assert.include(err.toString(), "AmlScoreExceedsThreshold");
    }
  });

  it("Rejects payment to a blocked country", async () => {
    const amount = new anchor.BN(5_000);
    const kycVerified = true;
    const amlScore = 30;
    const senderVaspId = Buffer.alloc(32, 1);
    const receiverVaspId = Buffer.alloc(32, 2);

    const payloadHash = computePayloadHash(
      kycVerified,
      amlScore,
      senderVaspId,
      receiverVaspId,
      true,
      1,
    );

    try {
      await program.methods
        .settlePayment(
          amount,
          1,
          100, // blocked country code
          kycVerified,
          amlScore,
          Array.from(senderVaspId) as any,
          Array.from(receiverVaspId) as any,
          true,
          1,
          Array.from(payloadHash) as any,
        )
        .accounts({
          config: configPda,
          policy: policyPda,
          complianceIssuer: complianceIssuer.publicKey,
          senderOwner: sender.publicKey,
          senderTokenAccount,
          recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([complianceIssuer, sender])
        .rpc();
      assert.fail("Should have been rejected");
    } catch (err: any) {
      assert.include(err.toString(), "ReceiverCountryBlocked");
    }
  });

  it("Rejects payment when KYC is not verified", async () => {
    const amount = new anchor.BN(5_000);
    const kycVerified = false;
    const amlScore = 30;
    const senderVaspId = Buffer.alloc(32, 1);
    const receiverVaspId = Buffer.alloc(32, 2);

    const payloadHash = computePayloadHash(
      kycVerified,
      amlScore,
      senderVaspId,
      receiverVaspId,
      true,
      1,
    );

    try {
      await program.methods
        .settlePayment(
          amount,
          1,
          2,
          kycVerified,
          amlScore,
          Array.from(senderVaspId) as any,
          Array.from(receiverVaspId) as any,
          true,
          1,
          Array.from(payloadHash) as any,
        )
        .accounts({
          config: configPda,
          policy: policyPda,
          complianceIssuer: complianceIssuer.publicKey,
          senderOwner: sender.publicKey,
          senderTokenAccount,
          recipientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([complianceIssuer, sender])
        .rpc();
      assert.fail("Should have been rejected");
    } catch (err: any) {
      assert.include(err.toString(), "KycNotVerified");
    }
  });
});
