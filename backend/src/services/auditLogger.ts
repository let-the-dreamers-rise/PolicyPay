import { AuditLog } from "../models/AuditLog";

export async function createAuditLog(params: {
  auditId: string;
  decisionId: string;
  inputSnapshot: unknown;
}): Promise<void> {
  await AuditLog.create({
    auditId: params.auditId,
    decisionId: params.decisionId,
    status: "pending",
    inputSnapshot: params.inputSnapshot,
  });
}

export async function updateAuditLogStatus(
  auditId: string,
  txSig: string,
  status: "submitted" | "confirmed" | "failed",
  eventData?: unknown,
): Promise<void> {
  await AuditLog.findOneAndUpdate(
    { auditId },
    {
      onChainTxSig: txSig,
      status,
      eventData,
      updatedAt: new Date(),
    },
  );
}
