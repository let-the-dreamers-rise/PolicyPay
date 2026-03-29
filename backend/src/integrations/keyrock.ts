import { createHash } from "crypto";
import { config } from "../config";
import { postPartnerJson } from "./http";
import type { KeyrockRouteResponse, PartnerPaymentContext } from "./types";

function deriveHex32(label: string, value: string): string {
  return createHash("sha256").update(`${label}:${value}`).digest("hex");
}

function buildFallbackRoute(ctx: PartnerPaymentContext): KeyrockRouteResponse {
  const routeSeed = `${ctx.policyOnChainAddress}:${ctx.senderCountry}:${ctx.receiverCountry}`;
  const routeId = createHash("sha1").update(routeSeed).digest("hex").slice(0, 12);

  return {
    senderVaspId: deriveHex32("keyrock-sender", ctx.senderPubkey),
    receiverVaspId: deriveHex32("keyrock-receiver", ctx.recipientPubkey),
    routeId: `ROUTE-${routeId.toUpperCase()}`,
    routeDescription: `Keyrock simulated corridor ${ctx.senderCountry} -> ${ctx.receiverCountry}`,
  };
}

export async function fetchKeyrockRoute(
  ctx: PartnerPaymentContext,
): Promise<KeyrockRouteResponse> {
  const url = config.KEYROCK_API_URL?.trim();
  if (!url) {
    return buildFallbackRoute(ctx);
  }
  return postPartnerJson<KeyrockRouteResponse>(url, config.KEYROCK_API_KEY, {
    ...ctx,
  });
}
