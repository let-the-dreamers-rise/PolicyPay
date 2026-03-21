import { Schema, model } from "mongoose";

const kytRecordSchema = new Schema({
  senderPubkey: { type: String, required: true },
  policyOnChainAddress: { type: String, required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

kytRecordSchema.index({ senderPubkey: 1, policyOnChainAddress: 1, createdAt: -1 });

export const KytRecord = model("KytRecord", kytRecordSchema);
