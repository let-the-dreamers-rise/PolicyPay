import { config } from "../config";
import { fetchAminaAttestation } from "./amina";
import { fetchFireblocksCustodyApproval } from "./fireblocks";
import { fetchKeyrockRoute } from "./keyrock";
import { fetchSolsticeRisk } from "./solstice";
import type { AttestationPayload } from "../services/compliance";
import type { PartnerPaymentContext } from "./types";

export type OrchestratedAttestationResult = {
  attestation: AttestationPayload;
  partnerMeta: {
    amina: Awaited<ReturnType<typeof fetchAminaAttestation>>;
    solstice: Awaited<ReturnType<typeof fetchSolsticeRisk>>;
    keyrock: Awaited<ReturnType<typeof fetchKeyrockRoute>>;
    fireblocks?: Awaited<ReturnType<typeof fetchFireblocksCustodyApproval>>;
    routeId?: string;
    routeDescription?: string;
    fxRiskLabel?: string;
  };
};

const HEX64 = /^[0-9a-fA-F]{64}$/;

function assertHex32(label: string, value: string): Buffer {
  if (!HEX64.test(value)) {
    throw new Error(`${label} must be 64 hex characters (32 bytes)`);
  }
  return Buffer.from(value, "hex");
}

/**
 * AMINA → Solstice → Keyrock → optional Fireblocks.
 * Merges partner fields into a single AttestationPayload for the program.
 */
export async function buildAttestationFromPartners(
  ctx: PartnerPaymentContext,
): Promise<OrchestratedAttestationResult> {
  const amina = await fetchAminaAttestation(ctx);
  const solstice = await fetchSolsticeRisk(ctx);
  const keyrock = await fetchKeyrockRoute(ctx);

  let fireblocks: Awaited<ReturnType<typeof fetchFireblocksCustodyApproval>> | undefined;
  if (config.ENABLE_FIREBLOCKS_GATE) {
    fireblocks = await fetchFireblocksCustodyApproval(ctx);
  }

  const senderVaspId = assertHex32(
    "senderVaspId",
    keyrock.senderVaspId || amina.senderVaspId || "0".repeat(64),
  );
  const receiverVaspId = assertHex32(
    "receiverVaspId",
    keyrock.receiverVaspId || amina.receiverVaspId || "0".repeat(64),
  );

  const amlScore = Math.min(255, Math.max(0, Math.floor(solstice.amlScore)));

  const attestation: AttestationPayload = {
    kycVerified: Boolean(amina.kycVerified),
    amlScore,
    senderVaspId,
    receiverVaspId,
    travelRuleFieldsPresent: Boolean(amina.travelRuleFieldsPresent),
    travelRulePayloadVersion: Math.min(
      255,
      Math.max(0, Math.floor(amina.travelRulePayloadVersion)),
    ),
  };

  return {
    attestation,
    partnerMeta: {
      amina,
      solstice,
      keyrock,
      fireblocks,
      routeId: keyrock.routeId,
      routeDescription: keyrock.routeDescription,
      fxRiskLabel: solstice.fxRiskLabel,
    },
  };
}
