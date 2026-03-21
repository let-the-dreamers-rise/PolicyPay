import { Schema, model } from "mongoose";

const auditLogSchema = new Schema({
  auditId: { type: String, required: true, unique: true },
  decisionId: { type: String, required: true },
  onChainTxSig: { type: String, default: "" },
  status: {
    type: String,
    enum: ["pending", "submitted", "confirmed", "failed"],
    default: "pending",
  },
  inputSnapshot: { type: Schema.Types.Mixed, required: true },
  eventData: { type: Schema.Types.Mixed, default: null },
  /** Cleared on failed execute so the same key can be retried; kept on confirmed for replay. */
  idempotencyKey: { type: String, sparse: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const AuditLog = model("AuditLog", auditLogSchema);
