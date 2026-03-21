import { Router, Request, Response } from "express";
import { AuditLog } from "../models/AuditLog";
import { Decision } from "../models/Decision";
import { fetchTransactionAuditPayload } from "../services/chainAudit";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [audits, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(),
    ]);

    res.json({
      success: true,
      audits,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Re-fetch on-chain tx metadata for an audit row (reconciliation / repair). */
router.post("/:id/enrich", async (req: Request, res: Response) => {
  try {
    const audit = await AuditLog.findOne({ auditId: req.params.id });
    if (!audit) {
      return res.status(404).json({ success: false, error: "Audit log not found" });
    }
    if (!audit.onChainTxSig) {
      return res.status(400).json({
        success: false,
        error: "No on-chain transaction signature on this audit",
      });
    }
    const payload = await fetchTransactionAuditPayload(audit.onChainTxSig);
    await AuditLog.findOneAndUpdate(
      { auditId: req.params.id },
      { eventData: payload, updatedAt: new Date() },
    );
    res.json({ success: true, eventData: payload });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const audit = await AuditLog.findOne({ auditId: req.params.id });
    if (!audit) {
      return res.status(404).json({ success: false, error: "Audit log not found" });
    }

    const decision = await Decision.findOne({ decisionId: audit.decisionId });

    res.json({ success: true, audit, decision });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
