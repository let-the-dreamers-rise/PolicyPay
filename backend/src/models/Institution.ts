import { Schema, model } from "mongoose";

const institutionSchema = new Schema({
  institutionId: { type: String, required: true, unique: true },
  onChainOwnerPubkey: { type: String, required: true },
  displayName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Institution = model("Institution", institutionSchema);
