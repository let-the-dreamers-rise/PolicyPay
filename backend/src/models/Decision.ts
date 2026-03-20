import { Schema, model } from "mongoose";

const decisionSchema = new Schema({
  decisionId: { type: String, required: true, unique: true },
  policyId: { type: Number, required: true },
  institutionId: { type: String, required: true },
  amount: { type: Number, required: true },
  senderCountry: { type: Number, required: true },
  receiverCountry: { type: Number, required: true },
  kycVerified: { type: Boolean, required: true },
  amlScore: { type: Number, required: true },
  travelRuleFieldsPresent: { type: Boolean, required: true },
  payloadHash: { type: String, required: true },
  allowed: { type: Boolean, required: true },
  reason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Decision = model("Decision", decisionSchema);
