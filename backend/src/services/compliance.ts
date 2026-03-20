import { createHash } from "crypto";

export interface AttestationPayload {
  kycVerified: boolean;
  amlScore: number;
  senderVaspId: Buffer;
  receiverVaspId: Buffer;
  travelRuleFieldsPresent: boolean;
  travelRulePayloadVersion: number;
}

export interface PolicyParams {
  maxAmount: number;
  requireKyc: boolean;
  amlThreshold: number;
  blockedCountries: number[];
  travelRuleRequired: boolean;
  travelRuleRequiredAmount: number;
}

export interface ComplianceDecision {
  allowed: boolean;
  reason: string | null;
}

/**
 * SHA-256 over the canonical attestation byte layout.
 * Must stay in sync with the on-chain `compute_payload_hash` function.
 */
export function computePayloadHash(payload: AttestationPayload): Buffer {
  const data = Buffer.alloc(68);
  let offset = 0;
  data.writeUInt8(payload.kycVerified ? 1 : 0, offset++);
  data.writeUInt8(payload.amlScore, offset++);
  payload.senderVaspId.copy(data, offset);
  offset += 32;
  payload.receiverVaspId.copy(data, offset);
  offset += 32;
  data.writeUInt8(payload.travelRuleFieldsPresent ? 1 : 0, offset++);
  data.writeUInt8(payload.travelRulePayloadVersion, offset++);
  return createHash("sha256").update(data).digest();
}

/**
 * Off-chain pre-check that mirrors the on-chain enforcement logic.
 * Returns `allowed: false` with a reason when the payment would be rejected.
 */
export function evaluateCompliance(
  policy: PolicyParams,
  amount: number,
  senderCountry: number,
  receiverCountry: number,
  attestation: AttestationPayload,
): ComplianceDecision {
  if (amount > policy.maxAmount) {
    return { allowed: false, reason: "Amount exceeds policy maximum" };
  }

  for (const blocked of policy.blockedCountries) {
    if (blocked === 0) continue;
    if (senderCountry === blocked) {
      return { allowed: false, reason: "Sender country is blocked" };
    }
    if (receiverCountry === blocked) {
      return { allowed: false, reason: "Receiver country is blocked" };
    }
  }

  if (policy.requireKyc && !attestation.kycVerified) {
    return { allowed: false, reason: "KYC verification required" };
  }

  if (attestation.amlScore > policy.amlThreshold) {
    return { allowed: false, reason: "AML score exceeds threshold" };
  }

  if (
    policy.travelRuleRequired &&
    amount >= policy.travelRuleRequiredAmount
  ) {
    if (!attestation.travelRuleFieldsPresent) {
      return { allowed: false, reason: "Travel Rule fields missing" };
    }
    if (Buffer.alloc(32).equals(attestation.senderVaspId)) {
      return { allowed: false, reason: "Sender VASP ID missing" };
    }
    if (Buffer.alloc(32).equals(attestation.receiverVaspId)) {
      return { allowed: false, reason: "Receiver VASP ID missing" };
    }
  }

  return { allowed: true, reason: null };
}
