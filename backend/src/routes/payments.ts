import { Router, Request, Response } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";
import { quotePaymentSchema, executePaymentSchema } from "../validation/schemas";
import {
  computePayloadHash,
  evaluateCompliance,
  AttestationPayload,
} from "../services/compliance";
import {
  settlePaymentOnChain,
  getProgram,
  getConfigPda,
} from "../services/solana";
import { PolicyModel } from "../models/Policy";
import { Decision } from "../models/Decision";
import { createAuditLog, updateAuditLogStatus } from "../services/auditLogger";

const router = Router();

function buildAttestation(body: {
  kycVerified: boolean;
  amlScore: number;
  senderVaspId: string;
  receiverVaspId: string;
  travelRuleFieldsPresent: boolean;
  travelRulePayloadVersion: number;
}): AttestationPayload {
  return {
    kycVerified: body.kycVerified,
    amlScore: body.amlScore,
    senderVaspId: Buffer.from(body.senderVaspId, "hex"),
    receiverVaspId: Buffer.from(body.receiverVaspId, "hex"),
    travelRuleFieldsPresent: body.travelRuleFieldsPresent,
    travelRulePayloadVersion: body.travelRulePayloadVersion,
  };
}

// ---------- Quote (off-chain pre-check) ----------

router.post("/quote", async (req: Request, res: Response) => {
  try {
    const body = quotePaymentSchema.parse(req.body);
    const attestation = buildAttestation(body);

    const policyDoc = await PolicyModel.findOne({
      onChainPolicyAddress: body.policyOnChainAddress,
    });
    if (!policyDoc) {
      return res.status(404).json({ success: false, error: "Policy not found" });
    }

    const blocked = [...(policyDoc.blockedCountries || [])];
    while (blocked.length < 10) blocked.push(0);

    const decision = evaluateCompliance(
      {
        maxAmount: policyDoc.maxAmount,
        requireKyc: policyDoc.requireKyc,
        amlThreshold: policyDoc.amlThreshold,
        blockedCountries: blocked,
        travelRuleRequired: policyDoc.travelRuleRequired,
        travelRuleRequiredAmount: policyDoc.travelRuleRequiredAmount,
      },
      body.amount,
      body.senderCountry,
      body.receiverCountry,
      attestation,
    );

    const payloadHash = computePayloadHash(attestation);
    const decisionId = uuidv4();

    await Decision.create({
      decisionId,
      policyId: policyDoc.policyId,
      institutionId: policyDoc.institutionId,
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      kycVerified: body.kycVerified,
      amlScore: body.amlScore,
      travelRuleFieldsPresent: body.travelRuleFieldsPresent,
      payloadHash: payloadHash.toString("hex"),
      allowed: decision.allowed,
      reason: decision.reason,
    });

    res.json({
      success: true,
      decisionId,
      allowed: decision.allowed,
      reason: decision.reason,
      payloadHash: payloadHash.toString("hex"),
    });
  } catch (err: any) {
    console.error("POST /payments/quote error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------- Execute (on-chain settlement) ----------

router.post("/execute", async (req: Request, res: Response) => {
  try {
    const body = executePaymentSchema.parse(req.body);
    const attestation = buildAttestation(body);

    const policyDoc = await PolicyModel.findOne({
      onChainPolicyAddress: body.policyOnChainAddress,
    });
    if (!policyDoc) {
      return res.status(404).json({ success: false, error: "Policy not found" });
    }

    const blocked = [...(policyDoc.blockedCountries || [])];
    while (blocked.length < 10) blocked.push(0);

    const preCheck = evaluateCompliance(
      {
        maxAmount: policyDoc.maxAmount,
        requireKyc: policyDoc.requireKyc,
        amlThreshold: policyDoc.amlThreshold,
        blockedCountries: blocked,
        travelRuleRequired: policyDoc.travelRuleRequired,
        travelRuleRequiredAmount: policyDoc.travelRuleRequiredAmount,
      },
      body.amount,
      body.senderCountry,
      body.receiverCountry,
      attestation,
    );

    const payloadHash = computePayloadHash(attestation);
    const decisionId = uuidv4();
    const auditId = uuidv4();

    await Decision.create({
      decisionId,
      policyId: policyDoc.policyId,
      institutionId: policyDoc.institutionId,
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      kycVerified: body.kycVerified,
      amlScore: body.amlScore,
      travelRuleFieldsPresent: body.travelRuleFieldsPresent,
      payloadHash: payloadHash.toString("hex"),
      allowed: preCheck.allowed,
      reason: preCheck.reason,
    });

    if (!preCheck.allowed) {
      await createAuditLog({ auditId, decisionId, inputSnapshot: body });
      await updateAuditLogStatus(auditId, "", "failed");
      return res.json({
        success: false,
        decisionId,
        auditId,
        allowed: false,
        reason: preCheck.reason,
      });
    }

    // Resolve token accounts
    await createAuditLog({ auditId, decisionId, inputSnapshot: body });

    const senderKeypair = Keypair.fromSecretKey(
      bs58.decode(body.senderSecretKey),
    );

    const prog = getProgram();
    const configPda = getConfigPda();
    const configAccount = await prog.account.programConfig.fetch(configPda);
    const usdcMint = configAccount.usdcMint as PublicKey;

    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      senderKeypair.publicKey,
    );
    const recipientPubkey = new PublicKey(body.recipientPubkey);
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      recipientPubkey,
    );

    const txSig = await settlePaymentOnChain({
      policyAddress: new PublicKey(body.policyOnChainAddress),
      senderKeypair,
      senderTokenAccount,
      recipientTokenAccount,
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      attestation,
    });

    await updateAuditLogStatus(auditId, txSig, "confirmed");

    res.json({
      success: true,
      decisionId,
      auditId,
      txSignature: txSig,
      allowed: true,
    });
  } catch (err: any) {
    console.error("POST /payments/execute error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
