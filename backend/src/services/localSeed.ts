import { PolicyModel } from "../models/Policy";
import { Decision } from "../models/Decision";
import { AuditLog } from "../models/AuditLog";

const LOCAL_POLICIES = [
  {
    policyId: 101,
    institutionId: "AMINA Bank Zurich",
    onChainPolicyAddress: "F8wbgEAjVgGBTTMXPKWRDzfw8sQJdd2KRe7EVWFDeGRL",
    maxAmount: 500000,
    requireKyc: true,
    amlThreshold: 120,
    blockedCountries: [7, 8, 9],
    travelRuleRequired: true,
    travelRuleRequiredAmount: 1000,
  },
  {
    policyId: 102,
    institutionId: "Solstice Labs",
    onChainPolicyAddress: "J2S5VC6rhY5G22mQhukKN6uo4EmN7Yi9ku37exs8jCZX",
    maxAmount: 300000,
    requireKyc: true,
    amlThreshold: 100,
    blockedCountries: [7, 8],
    travelRuleRequired: true,
    travelRuleRequiredAmount: 2500,
  },
  {
    policyId: 103,
    institutionId: "PolicyPay Sandbox",
    onChainPolicyAddress: "6gYY3Z9r2h3R9yyos7wwpTkVvG7eoTKnBwXierxH4vVf",
    maxAmount: 750000,
    requireKyc: true,
    amlThreshold: 255,
    blockedCountries: [],
    travelRuleRequired: false,
    travelRuleRequiredAmount: 5000,
  },
] as const;

const LOCAL_DECISION = {
  decisionId: "DEC-LIVE-0001",
  policyId: 101,
  institutionId: "AMINA Bank Zurich",
  amount: 120000,
  senderCountry: 7,
  receiverCountry: 2,
  kycVerified: true,
  amlScore: 32,
  fxRiskLabel: null,
  travelRuleFieldsPresent: true,
  payloadHash: "0".repeat(64),
  allowed: false,
  reason: "Sender country is blocked",
} as const;

const LOCAL_AUDITS = [
  {
    auditId: "AUD-LIVE-0001",
    decisionId: "DEC-LIVE-0001",
    onChainTxSig: "",
    status: "failed",
    inputSnapshot: {
      amount: 120000,
      senderCountry: 7,
      receiverCountry: 2,
      kycVerified: true,
      amlScore: 32,
      travelRuleFieldsPresent: true,
    },
    eventData: null,
  },
  {
    auditId: "AUD-LIVE-0002",
    decisionId: "DEC-LIVE-0002",
    onChainTxSig: "",
    status: "pending",
    inputSnapshot: {
      amount: 85000,
      senderCountry: 1,
      receiverCountry: 5,
      kycVerified: true,
      amlScore: 21,
      travelRuleFieldsPresent: true,
    },
    eventData: null,
  },
] as const;

export async function seedLocalData(): Promise<void> {
  for (const policy of LOCAL_POLICIES) {
    await PolicyModel.updateOne(
      { institutionId: policy.institutionId, policyId: policy.policyId },
      { $set: policy },
      { upsert: true },
    );
  }

  await Decision.updateOne(
    { decisionId: LOCAL_DECISION.decisionId },
    { $set: LOCAL_DECISION },
    { upsert: true },
  );

  for (const audit of LOCAL_AUDITS) {
    await AuditLog.updateOne(
      { auditId: audit.auditId },
      { $set: audit },
      { upsert: true },
    );
  }

  console.log(
    `Seeded ${LOCAL_POLICIES.length} local policies, ${LOCAL_AUDITS.length} audit rows, and 1 decision.`,
  );
}

export async function seedLocalDataIfEmpty(): Promise<void> {
  const existingPolicies = await PolicyModel.countDocuments();
  if (existingPolicies > 0) {
    return;
  }

  await seedLocalData();
}
