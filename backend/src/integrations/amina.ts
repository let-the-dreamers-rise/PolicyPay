import { config } from "../config";
import { IntegrationMisconfiguredError } from "./errors";
import { postPartnerJson } from "./http";
import type { AminaAttestationResponse, PartnerPaymentContext } from "./types";

export async function fetchAminaAttestation(
  ctx: PartnerPaymentContext,
): Promise<AminaAttestationResponse> {
  const url = config.AMINA_API_URL?.trim();
  if (!url) {
    throw new IntegrationMisconfiguredError(
      "AMINA_API_URL is not configured (required for orchestrated flow)",
    );
  }
  return postPartnerJson<AminaAttestationResponse>(url, config.AMINA_API_KEY, {
    ...ctx,
  });
}
