import { Router, Request, Response } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";
import { config } from "../config";
import {
  quotePaymentSchema,
  executePaymentSchema,
  orchestratedQuoteSchema,
  orchestratedExecuteSchema,
} from "../validation/schemas";
import {
  computePayloadHash,
  evaluateCompliance,
  AttestationPayload,
} from "../services/compliance";
import {
  settlePaymentOnChain,
  getConfigPda,
  fetchConfigUsdcMint,
  fetchPolicyAccountFromChain,
} from "../services/solana";
import { PolicyModel } from "../models/Policy";
import { Decision } from "../models/Decision";
import { AuditLog } from "../models/AuditLog";
import {
  createAuditLog,
  updateAuditLogStatus,
  clearAuditIdempotencyKey,
} from "../services/auditLogger";
import { buildAttestationFromPartners } from "../integrations/orchestrator";
import { evaluateKyt, recordKytTouch } from "../services/kyt";
import { resolvePolicyParams } from "../services/policyParams";
import { fetchTransactionAuditPayload } from "../services/chainAudit";
import { httpErrorFromUnknown } from "../services/paymentErrors";

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

async function loadPolicyContext(policyOnChainAddress: string) {
  const policyDoc = await PolicyModel.findOne({
    onChainPolicyAddress: policyOnChainAddress,
  });
  if (!policyDoc) {
    return { ok: false as const, status: 404, error: "Policy not found" };
  }

  let onChain: Awaited<ReturnType<typeof fetchPolicyAccountFromChain>> | null =
    null;
  if (config.USE_ONCHAIN_POLICY) {
    try {
      onChain = await fetchPolicyAccountFromChain(
        new PublicKey(policyOnChainAddress),
      );
    } catch (e) {
      console.error("fetchPolicyAccountFromChain:", e);
      return {
        ok: false as const,
        status: 502,
        error: "Failed to load on-chain policy account",
      };
    }
  }

  const policyParams = resolvePolicyParams(policyDoc, onChain);
  return { ok: true as const, policyDoc, policyParams };
}

// ---------- Quote (direct attestation) ----------

router.post("/quote", async (req: Request, res: Response) => {
  try {
    const body = quotePaymentSchema.parse(req.body);

    if (body.idempotencyKey) {
      const prev = await Decision.findOne({
        idempotencyKey: body.idempotencyKey,
      });
      if (prev) {
        return res.json({
          success: true,
          cached: true,
          decisionId: prev.decisionId,
          allowed: prev.allowed,
          reason: prev.reason,
          payloadHash: prev.payloadHash,
        });
      }
    }

    const ctx = await loadPolicyContext(body.policyOnChainAddress);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ success: false, error: ctx.error });
    }

    if (body.senderPubkey) {
      const kyt = await evaluateKyt({
        senderPubkey: body.senderPubkey,
        policyOnChainAddress: body.policyOnChainAddress,
        amount: body.amount,
      });
      if (!kyt.allowed) {
        const decisionId = uuidv4();
        await Decision.create({
          decisionId,
          policyId: ctx.policyDoc.policyId,
          institutionId: ctx.policyDoc.institutionId,
          amount: body.amount,
          senderCountry: body.senderCountry,
          receiverCountry: body.receiverCountry,
          kycVerified: body.kycVerified,
          amlScore: body.amlScore,
          travelRuleFieldsPresent: body.travelRuleFieldsPresent,
          payloadHash: "0".repeat(64),
          allowed: false,
          reason: kyt.reason,
          idempotencyKey: body.idempotencyKey,
        });
        return res.json({
          success: true,
          decisionId,
          allowed: false,
          reason: kyt.reason,
          payloadHash: null,
        });
      }
    }

    const attestation = buildAttestation(body);
    const decision = evaluateCompliance(
      ctx.policyParams,
      body.amount,
      body.senderCountry,
      body.receiverCountry,
      attestation,
    );

    const payloadHash = computePayloadHash(attestation);
    const decisionId = uuidv4();

    await Decision.create({
      decisionId,
      policyId: ctx.policyDoc.policyId,
      institutionId: ctx.policyDoc.institutionId,
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      kycVerified: body.kycVerified,
      amlScore: body.amlScore,
      travelRuleFieldsPresent: body.travelRuleFieldsPresent,
      payloadHash: payloadHash.toString("hex"),
      allowed: decision.allowed,
      reason: decision.reason,
      idempotencyKey: body.idempotencyKey,
    });

    res.json({
      success: true,
      decisionId,
      allowed: decision.allowed,
      reason: decision.reason,
      payloadHash: payloadHash.toString("hex"),
    });
  } catch (err: unknown) {
    console.error("POST /payments/quote error:", err);
    const { status, message } = httpErrorFromUnknown(err);
    res.status(status).json({ success: false, error: message });
  }
});

// ---------- Quote (orchestrated partners) ----------

router.post("/quote/orchestrated", async (req: Request, res: Response) => {
  try {
    const body = orchestratedQuoteSchema.parse(req.body);

    if (body.idempotencyKey) {
      const prev = await Decision.findOne({
        idempotencyKey: body.idempotencyKey,
      });
      if (prev) {
        return res.json({
          success: true,
          cached: true,
          decisionId: prev.decisionId,
          allowed: prev.allowed,
          reason: prev.reason,
          payloadHash: prev.payloadHash || null,
        });
      }
    }

    const ctx = await loadPolicyContext(body.policyOnChainAddress);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ success: false, error: ctx.error });
    }

    const kyt = await evaluateKyt({
      senderPubkey: body.senderPubkey,
      policyOnChainAddress: body.policyOnChainAddress,
      amount: body.amount,
    });
    if (!kyt.allowed) {
      const decisionId = uuidv4();
      await Decision.create({
        decisionId,
        policyId: ctx.policyDoc.policyId,
        institutionId: ctx.policyDoc.institutionId,
        amount: body.amount,
        senderCountry: body.senderCountry,
        receiverCountry: body.receiverCountry,
        kycVerified: false,
        amlScore: 0,
        fxRiskLabel: null,
        travelRuleFieldsPresent: false,
        payloadHash: "0".repeat(64),
        allowed: false,
        reason: kyt.reason,
        idempotencyKey: body.idempotencyKey,
      });
      return res.json({
        success: true,
        decisionId,
        allowed: false,
        reason: kyt.reason,
        payloadHash: null,
        partnerMeta: null,
      });
    }

    const partnerCtx = {
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      policyOnChainAddress: body.policyOnChainAddress,
      senderPubkey: body.senderPubkey,
      recipientPubkey: body.recipientPubkey,
    };

    const { attestation, partnerMeta } =
      await buildAttestationFromPartners(partnerCtx);

    const decision = evaluateCompliance(
      ctx.policyParams,
      body.amount,
      body.senderCountry,
      body.receiverCountry,
      attestation,
    );

    const payloadHash = computePayloadHash(attestation);
    const decisionId = uuidv4();

    await Decision.create({
      decisionId,
      policyId: ctx.policyDoc.policyId,
      institutionId: ctx.policyDoc.institutionId,
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      kycVerified: attestation.kycVerified,
      amlScore: attestation.amlScore,
      fxRiskLabel: partnerMeta.fxRiskLabel ?? null,
      travelRuleFieldsPresent: attestation.travelRuleFieldsPresent,
      payloadHash: payloadHash.toString("hex"),
      allowed: decision.allowed,
      reason: decision.reason,
      idempotencyKey: body.idempotencyKey,
    });

    res.json({
      success: true,
      decisionId,
      allowed: decision.allowed,
      reason: decision.reason,
      payloadHash: payloadHash.toString("hex"),
      partnerMeta,
      attestationPreview: {
        kycVerified: attestation.kycVerified,
        amlScore: attestation.amlScore,
        senderVaspId: attestation.senderVaspId.toString("hex"),
        receiverVaspId: attestation.receiverVaspId.toString("hex"),
        travelRuleFieldsPresent: attestation.travelRuleFieldsPresent,
        travelRulePayloadVersion: attestation.travelRulePayloadVersion,
      },
    });
  } catch (err: unknown) {
    console.error("POST /payments/quote/orchestrated error:", err);
    const { status, message } = httpErrorFromUnknown(err);
    res.status(status).json({ success: false, error: message });
  }
});

// ---------- Execute (direct attestation) ----------

router.post("/execute", async (req: Request, res: Response) => {
  let auditIdForCleanup: string | null = null;
  let auditCreated = false;
  try {
    const body = executePaymentSchema.parse(req.body);

    if (body.idempotencyKey) {
      const done = await AuditLog.findOne({
        idempotencyKey: body.idempotencyKey,
        status: "confirmed",
      });
      if (done?.onChainTxSig) {
        return res.json({
          success: true,
          cached: true,
          decisionId: done.decisionId,
          auditId: done.auditId,
          txSignature: done.onChainTxSig,
          allowed: true,
        });
      }
      const inflight = await AuditLog.findOne({
        idempotencyKey: body.idempotencyKey,
        status: { $in: ["pending", "submitted"] },
      });
      if (inflight) {
        return res.status(409).json({
          success: false,
          error: "Idempotent execute already in progress",
        });
      }
    }

    const ctx = await loadPolicyContext(body.policyOnChainAddress);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ success: false, error: ctx.error });
    }

    const senderKeypair = Keypair.fromSecretKey(
      bs58.decode(body.senderSecretKey),
    );
    const senderPk = senderKeypair.publicKey.toBase58();

    const kyt = await evaluateKyt({
      senderPubkey: senderPk,
      policyOnChainAddress: body.policyOnChainAddress,
      amount: body.amount,
    });
    if (!kyt.allowed) {
      const decisionId = uuidv4();
      await Decision.create({
        decisionId,
        policyId: ctx.policyDoc.policyId,
        institutionId: ctx.policyDoc.institutionId,
        amount: body.amount,
        senderCountry: body.senderCountry,
        receiverCountry: body.receiverCountry,
        kycVerified: body.kycVerified,
        amlScore: body.amlScore,
        travelRuleFieldsPresent: body.travelRuleFieldsPresent,
        payloadHash: "0".repeat(64),
        allowed: false,
        reason: kyt.reason,
      });
      return res.json({
        success: false,
        decisionId,
        allowed: false,
        reason: kyt.reason,
      });
    }

    const attestation = buildAttestation(body);

    const preCheck = evaluateCompliance(
      ctx.policyParams,
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
      policyId: ctx.policyDoc.policyId,
      institutionId: ctx.policyDoc.institutionId,
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

    await createAuditLog({
      auditId,
      decisionId,
      inputSnapshot: body,
      idempotencyKey: body.idempotencyKey,
    });
    auditCreated = true;
    if (body.idempotencyKey) auditIdForCleanup = auditId;

    const usdcMint = await fetchConfigUsdcMint(getConfigPda());

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

    const chainPayload = await fetchTransactionAuditPayload(txSig);
    await updateAuditLogStatus(auditId, txSig, "confirmed", chainPayload);

    await recordKytTouch({
      senderPubkey: senderPk,
      policyOnChainAddress: body.policyOnChainAddress,
      amount: body.amount,
    });

    res.json({
      success: true,
      decisionId,
      auditId,
      txSignature: txSig,
      allowed: true,
    });
  } catch (err: unknown) {
    console.error("POST /payments/execute error:", err);
    if (auditCreated && auditIdForCleanup) {
      await clearAuditIdempotencyKey(auditIdForCleanup);
      await updateAuditLogStatus(auditIdForCleanup, "", "failed");
    }
    const { status, message } = httpErrorFromUnknown(err);
    res.status(status).json({ success: false, error: message });
  }
});

// ---------- Execute (orchestrated) ----------

router.post("/execute/orchestrated", async (req: Request, res: Response) => {
  let auditIdForCleanup: string | null = null;
  let auditCreated = false;
  try {
    const body = orchestratedExecuteSchema.parse(req.body);

    if (body.idempotencyKey) {
      const done = await AuditLog.findOne({
        idempotencyKey: body.idempotencyKey,
        status: "confirmed",
      });
      if (done?.onChainTxSig) {
        return res.json({
          success: true,
          cached: true,
          decisionId: done.decisionId,
          auditId: done.auditId,
          txSignature: done.onChainTxSig,
          allowed: true,
        });
      }
      const inflight = await AuditLog.findOne({
        idempotencyKey: body.idempotencyKey,
        status: { $in: ["pending", "submitted"] },
      });
      if (inflight) {
        return res.status(409).json({
          success: false,
          error: "Idempotent execute already in progress",
        });
      }
    }

    const ctx = await loadPolicyContext(body.policyOnChainAddress);
    if (!ctx.ok) {
      return res.status(ctx.status).json({ success: false, error: ctx.error });
    }

    const senderKeypair = Keypair.fromSecretKey(
      bs58.decode(body.senderSecretKey),
    );
    const senderPk = senderKeypair.publicKey.toBase58();

    if (senderPk !== body.senderPubkey) {
      return res.status(400).json({
        success: false,
        error: "senderSecretKey does not match senderPubkey",
      });
    }

    const kyt = await evaluateKyt({
      senderPubkey: senderPk,
      policyOnChainAddress: body.policyOnChainAddress,
      amount: body.amount,
    });
    if (!kyt.allowed) {
      const decisionId = uuidv4();
      await Decision.create({
        decisionId,
        policyId: ctx.policyDoc.policyId,
        institutionId: ctx.policyDoc.institutionId,
        amount: body.amount,
        senderCountry: body.senderCountry,
        receiverCountry: body.receiverCountry,
        kycVerified: false,
        amlScore: 0,
        fxRiskLabel: null,
        travelRuleFieldsPresent: false,
        payloadHash: "0".repeat(64),
        allowed: false,
        reason: kyt.reason,
      });
      return res.json({
        success: false,
        decisionId,
        allowed: false,
        reason: kyt.reason,
      });
    }

    const partnerCtx = {
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      policyOnChainAddress: body.policyOnChainAddress,
      senderPubkey: body.senderPubkey,
      recipientPubkey: body.recipientPubkey,
    };

    const { attestation, partnerMeta } =
      await buildAttestationFromPartners(partnerCtx);

    const preCheck = evaluateCompliance(
      ctx.policyParams,
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
      policyId: ctx.policyDoc.policyId,
      institutionId: ctx.policyDoc.institutionId,
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      kycVerified: attestation.kycVerified,
      amlScore: attestation.amlScore,
      fxRiskLabel: partnerMeta.fxRiskLabel ?? null,
      travelRuleFieldsPresent: attestation.travelRuleFieldsPresent,
      payloadHash: payloadHash.toString("hex"),
      allowed: preCheck.allowed,
      reason: preCheck.reason,
    });

    if (!preCheck.allowed) {
      await createAuditLog({
        auditId,
        decisionId,
        inputSnapshot: { ...body, partnerMeta },
      });
      await updateAuditLogStatus(auditId, "", "failed");
      return res.json({
        success: false,
        decisionId,
        auditId,
        allowed: false,
        reason: preCheck.reason,
        partnerMeta,
      });
    }

    await createAuditLog({
      auditId,
      decisionId,
      inputSnapshot: { ...body, partnerMeta },
      idempotencyKey: body.idempotencyKey,
    });
    auditCreated = true;
    if (body.idempotencyKey) auditIdForCleanup = auditId;

    const usdcMint = await fetchConfigUsdcMint(getConfigPda());

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

    const chainPayload = await fetchTransactionAuditPayload(txSig);
    await updateAuditLogStatus(auditId, txSig, "confirmed", chainPayload);

    await recordKytTouch({
      senderPubkey: senderPk,
      policyOnChainAddress: body.policyOnChainAddress,
      amount: body.amount,
    });

    res.json({
      success: true,
      decisionId,
      auditId,
      txSignature: txSig,
      allowed: true,
      partnerMeta,
    });
  } catch (err: unknown) {
    console.error("POST /payments/execute/orchestrated error:", err);
    if (auditCreated && auditIdForCleanup) {
      await clearAuditIdempotencyKey(auditIdForCleanup);
      await updateAuditLogStatus(auditIdForCleanup, "", "failed");
    }
    const { status, message } = httpErrorFromUnknown(err);
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
