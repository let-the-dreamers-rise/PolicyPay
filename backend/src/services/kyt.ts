import { config } from "../config";
import { postPartnerJson } from "../integrations/http";
import type { KytApiResponse } from "../integrations/types";
import { KytRecord } from "../models/KytRecord";

const DAY_MS = 24 * 60 * 60 * 1000;

export type KytResult = { allowed: boolean; reason: string | null };

/**
 * Rolling 24h window in Mongo + optional external KYT_API_URL (must allow when configured).
 */
export async function evaluateKyt(params: {
  senderPubkey: string;
  policyOnChainAddress: string;
  amount: number;
}): Promise<KytResult> {
  const since = new Date(Date.now() - DAY_MS);
  const filter = {
    senderPubkey: params.senderPubkey,
    policyOnChainAddress: params.policyOnChainAddress,
    createdAt: { $gte: since },
  };

  const [count, agg] = await Promise.all([
    KytRecord.countDocuments(filter),
    KytRecord.aggregate<{ total: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const volume = agg[0]?.total ?? 0;

  if (count >= config.KYT_MAX_TX_PER_DAY) {
    return {
      allowed: false,
      reason: "KYT: maximum transactions in rolling 24h window exceeded",
    };
  }

  if (volume + params.amount > config.KYT_MAX_VOLUME_PER_DAY) {
    return {
      allowed: false,
      reason: "KYT: maximum volume in rolling 24h window exceeded",
    };
  }

  const url = config.KYT_API_URL?.trim();
  if (url) {
    const data = await postPartnerJson<KytApiResponse>(url, config.KYT_API_KEY, {
      senderPubkey: params.senderPubkey,
      policyOnChainAddress: params.policyOnChainAddress,
      amount: params.amount,
    });
    if (!data.allow) {
      return {
        allowed: false,
        reason: data.reason || "KYT API denied",
      };
    }
  }

  return { allowed: true, reason: null };
}

export async function recordKytTouch(params: {
  senderPubkey: string;
  policyOnChainAddress: string;
  amount: number;
}): Promise<void> {
  await KytRecord.create({
    senderPubkey: params.senderPubkey,
    policyOnChainAddress: params.policyOnChainAddress,
    amount: params.amount,
  });
}
