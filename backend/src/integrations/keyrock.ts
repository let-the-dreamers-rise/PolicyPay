import { config } from "../config";
import { IntegrationMisconfiguredError } from "./errors";
import { postPartnerJson } from "./http";
import type { KeyrockRouteResponse, PartnerPaymentContext } from "./types";

export async function fetchKeyrockRoute(
  ctx: PartnerPaymentContext,
): Promise<KeyrockRouteResponse> {
  const url = config.KEYROCK_API_URL?.trim();
  if (!url) {
    throw new IntegrationMisconfiguredError(
      "KEYROCK_API_URL is not configured (required for orchestrated flow)",
    );
  }
  return postPartnerJson<KeyrockRouteResponse>(url, config.KEYROCK_API_KEY, {
    ...ctx,
  });
}
