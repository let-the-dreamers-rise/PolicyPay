import { z } from "zod";

const hexBytes32 = z.string().length(64).regex(/^[0-9a-fA-F]+$/);

/** Optional idempotency key (UUID or opaque string; max 128 chars). */
export const idempotencyKeySchema = z.string().min(1).max(128).optional();

export const createPolicySchema = z.object({
  institutionId: z.string().min(1),
  institutionSecretKey: z.string().min(1),
  policyId: z.number().int().positive(),
  maxAmount: z.number().int().positive(),
  requireKyc: z.boolean(),
  amlThreshold: z.number().int().min(0).max(255),
  blockedCountries: z.array(z.number().int().min(0).max(255)).max(10),
  travelRuleRequired: z.boolean(),
  travelRuleRequiredAmount: z.number().int().min(0),
});

export const quotePaymentSchema = z.object({
  policyOnChainAddress: z.string().min(1),
  amount: z.number().int().positive(),
  senderCountry: z.number().int().min(0).max(255),
  receiverCountry: z.number().int().min(0).max(255),
  kycVerified: z.boolean(),
  amlScore: z.number().int().min(0).max(255),
  senderVaspId: hexBytes32,
  receiverVaspId: hexBytes32,
  travelRuleFieldsPresent: z.boolean(),
  travelRulePayloadVersion: z.number().int().min(0).max(255),
  idempotencyKey: idempotencyKeySchema,
  /** Used for KYT-lite windowing when present. */
  senderPubkey: z.string().min(1).optional(),
});

export const executePaymentSchema = quotePaymentSchema.extend({
  senderSecretKey: z.string().min(1),
  recipientPubkey: z.string().min(1),
});

/** Orchestrated: partners supply attestation fields; body carries payment facts + pubkeys. */
export const orchestratedQuoteSchema = z.object({
  policyOnChainAddress: z.string().min(1),
  amount: z.number().int().positive(),
  senderCountry: z.number().int().min(0).max(255),
  receiverCountry: z.number().int().min(0).max(255),
  senderPubkey: z.string().min(1),
  recipientPubkey: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

export const orchestratedExecuteSchema = orchestratedQuoteSchema.extend({
  senderSecretKey: z.string().min(1),
});

/** Multi-hop demo: Keyrock routing preview + audit row (no Decision). */
export const demoRouteQuoteSchema = orchestratedQuoteSchema.extend({
  demoScenario: z.string().min(1).optional(),
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type QuotePaymentInput = z.infer<typeof quotePaymentSchema>;
export type ExecutePaymentInput = z.infer<typeof executePaymentSchema>;
export type OrchestratedQuoteInput = z.infer<typeof orchestratedQuoteSchema>;
export type OrchestratedExecuteInput = z.infer<typeof orchestratedExecuteSchema>;
export type DemoRouteQuoteInput = z.infer<typeof demoRouteQuoteSchema>;
