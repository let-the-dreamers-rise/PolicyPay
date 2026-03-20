import { Router, Request, Response } from "express";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createPolicySchema } from "../validation/schemas";
import { createPolicyOnChain, getPolicyPda } from "../services/solana";
import { PolicyModel } from "../models/Policy";
import { Institution } from "../models/Institution";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = createPolicySchema.parse(req.body);

    const institutionKeypair = Keypair.fromSecretKey(
      bs58.decode(body.institutionSecretKey),
    );

    const blocked = [...body.blockedCountries];
    while (blocked.length < 10) blocked.push(0);

    const txSig = await createPolicyOnChain({
      institutionKeypair,
      policyId: body.policyId,
      maxAmount: body.maxAmount,
      requireKyc: body.requireKyc,
      amlThreshold: body.amlThreshold,
      blockedCountries: blocked,
      travelRuleRequired: body.travelRuleRequired,
      travelRuleRequiredAmount: body.travelRuleRequiredAmount,
    });

    const policyPda = getPolicyPda(
      institutionKeypair.publicKey,
      body.policyId,
    );

    await Institution.findOneAndUpdate(
      { institutionId: body.institutionId },
      {
        institutionId: body.institutionId,
        onChainOwnerPubkey: institutionKeypair.publicKey.toBase58(),
        displayName: body.institutionId,
      },
      { upsert: true },
    );

    const policyDoc = await PolicyModel.create({
      policyId: body.policyId,
      institutionId: body.institutionId,
      onChainPolicyAddress: policyPda.toBase58(),
      maxAmount: body.maxAmount,
      requireKyc: body.requireKyc,
      amlThreshold: body.amlThreshold,
      blockedCountries: body.blockedCountries,
      travelRuleRequired: body.travelRuleRequired,
      travelRuleRequiredAmount: body.travelRuleRequiredAmount,
    });

    res.json({
      success: true,
      txSignature: txSig,
      policyAddress: policyPda.toBase58(),
      policy: policyDoc,
    });
  } catch (err: any) {
    console.error("POST /policies error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const policies = await PolicyModel.find().sort({ createdAt: -1 });
    res.json({ success: true, policies });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:address", async (req: Request, res: Response) => {
  try {
    const policy = await PolicyModel.findOne({
      onChainPolicyAddress: req.params.address,
    });
    if (!policy) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    res.json({ success: true, policy });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
