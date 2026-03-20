import { Schema, model } from "mongoose";

const policySchema = new Schema({
  policyId: { type: Number, required: true },
  institutionId: { type: String, required: true },
  onChainPolicyAddress: { type: String },
  maxAmount: { type: Number, required: true },
  requireKyc: { type: Boolean, required: true },
  amlThreshold: { type: Number, required: true },
  blockedCountries: [{ type: Number }],
  travelRuleRequired: { type: Boolean, required: true },
  travelRuleRequiredAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

policySchema.index({ institutionId: 1, policyId: 1 }, { unique: true });

export const PolicyModel = model("Policy", policySchema);
