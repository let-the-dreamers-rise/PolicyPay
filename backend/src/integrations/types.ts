/** Shared POST body sent to each partner (extend per partner as needed). */
export type PartnerPaymentContext = {
  amount: number;
  senderCountry: number;
  receiverCountry: number;
  policyOnChainAddress: string;
  senderPubkey: string;
  recipientPubkey: string;
};

/** Expected JSON shape from AMINA (compliance / issuer). */
export type AminaAttestationResponse = {
  kycVerified: boolean;
  travelRuleFieldsPresent: boolean;
  travelRulePayloadVersion: number;
  senderVaspId?: string;
  receiverVaspId?: string;
};

/** Expected JSON shape from Solstice (risk). */
export type SolsticeRiskResponse = {
  amlScore: number;
  fxRiskLabel?: string;
};

/** Expected JSON shape from Keyrock (routing / VASP). */
export type KeyrockRouteResponse = {
  senderVaspId: string;
  receiverVaspId: string;
  routeId?: string;
  routeDescription?: string;
};

/** Expected JSON shape from Fireblocks custody gate. */
export type FireblocksCustodyResponse = {
  approved: boolean;
  custodyRef?: string;
};

/** Optional external KYT API. */
export type KytApiResponse = {
  allow: boolean;
  reason?: string;
};
