import { AuditLog } from "../models/AuditLog";

export async function createAuditLog(params: {
  auditId: string;
  decisionId: string;
  inputSnapshot: unknown;
  idempotencyKey?: string;
}): Promise<void> {
  await AuditLog.create({
    auditId: params.auditId,
    decisionId: params.decisionId,
    status: "pending",
    inputSnapshot: params.inputSnapshot,
    ...(params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : {}),
  });
}

export async function clearAuditIdempotencyKey(auditId: string): Promise<void> {
  await AuditLog.findOneAndUpdate(
    { auditId },
    { $unset: { idempotencyKey: 1 }, updatedAt: new Date() },
  );
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
