import { config } from "../config";
import { IntegrationMisconfiguredError } from "./errors";
import { postPartnerJson } from "./http";
import type { PartnerPaymentContext, SolsticeRiskResponse } from "./types";

export async function fetchSolsticeRisk(
  ctx: PartnerPaymentContext,
): Promise<SolsticeRiskResponse> {
  const url = config.SOLSTICE_API_URL?.trim();
  if (!url) {
    throw new IntegrationMisconfiguredError(
      "SOLSTICE_API_URL is not configured (required for orchestrated flow)",
    );
  }
  return postPartnerJson<SolsticeRiskResponse>(url, config.SOLSTICE_API_KEY, {
    ...ctx,
  });
}
