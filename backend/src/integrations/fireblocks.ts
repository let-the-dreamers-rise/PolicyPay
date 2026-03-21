import { config } from "../config";
import { IntegrationMisconfiguredError, IntegrationUpstreamError } from "./errors";
import { postPartnerJson } from "./http";
import type { FireblocksCustodyResponse, PartnerPaymentContext } from "./types";

export async function fetchFireblocksCustodyApproval(
  ctx: PartnerPaymentContext,
): Promise<FireblocksCustodyResponse> {
  const url = config.FIREBLOCKS_SIM_URL?.trim();
  if (!url) {
    throw new IntegrationMisconfiguredError(
      "FIREBLOCKS_SIM_URL is not configured (required when ENABLE_FIREBLOCKS_GATE=true)",
    );
  }
  const data = await postPartnerJson<FireblocksCustodyResponse>(
    url,
    config.FIREBLOCKS_SIM_API_KEY,
    { ...ctx },
  );
  if (!data.approved) {
    throw new IntegrationUpstreamError("Fireblocks custody gate returned approved=false");
  }
  return data;
}
