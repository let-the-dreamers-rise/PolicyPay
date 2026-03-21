import { getProvider } from "./solana";

export type ChainTxAuditPayload = {
  found: boolean;
  err?: unknown;
  logMessages?: string[];
  slot?: number;
};

/**
 * Pull on-chain transaction metadata for audit enrichment (ComplianceDecisionEvent parsing can be added later).
 */
export async function fetchTransactionAuditPayload(
  txSignature: string,
): Promise<ChainTxAuditPayload> {
  const conn = getProvider().connection;
  const tx = await conn.getTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) {
    return { found: false };
  }

  return {
    found: true,
    err: tx.meta?.err ?? null,
    logMessages: tx.meta?.logMessages ?? [],
    slot: tx.slot,
  };
}
