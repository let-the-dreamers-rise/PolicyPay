import { config } from "../config";
import type { PolicyParams } from "./compliance";
import type { OnChainPolicyAccount } from "./solana";

type MongoPolicy = {
  maxAmount: number;
  requireKyc: boolean;
  amlThreshold: number;
  blockedCountries?: number[];
  travelRuleRequired: boolean;
  travelRuleRequiredAmount: number;
};

function padBlocked(blocked: number[]): number[] {
  const b = [...blocked];
  while (b.length < 10) b.push(0);
  return b;
}

/**
 * When USE_ONCHAIN_POLICY is true and on-chain fields are present, prefer chain for enforcement.
 */
export function resolvePolicyParams(
  policyDoc: MongoPolicy,
  onChain: OnChainPolicyAccount | null,
): PolicyParams {
  if (config.USE_ONCHAIN_POLICY && onChain) {
    return {
      maxAmount: onChain.maxAmount,
      requireKyc: onChain.requireKyc,
      amlThreshold: onChain.amlThreshold,
      blockedCountries: padBlocked(onChain.blockedCountries),
      travelRuleRequired: onChain.travelRuleRequired,
      travelRuleRequiredAmount: onChain.travelRuleRequiredAmount,
    };
  }

  return {
    maxAmount: policyDoc.maxAmount,
    requireKyc: policyDoc.requireKyc,
    amlThreshold: policyDoc.amlThreshold,
    blockedCountries: padBlocked(policyDoc.blockedCountries || []),
    travelRuleRequired: policyDoc.travelRuleRequired,
    travelRuleRequiredAmount: policyDoc.travelRuleRequiredAmount,
  };
}
