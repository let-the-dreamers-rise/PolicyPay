import { createHash } from "crypto";
import { config } from "../config";
import { fetchSixIntradaySnapshot } from "./sixMtlClient";
import type { PartnerPaymentContext, SolsticeRiskResponse } from "./types";

function parseThreshold(raw: string, fallback: number): number {
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clampU8(n: number): number {
  const x = Math.round(n);
  return Math.max(0, Math.min(255, x));
}

function scanNumericFields(
  input: unknown,
  wantedKeys: Set<string>,
  maxDepth = 6,
): Record<string, number> {
  const out: Record<string, number> = {};

  const visit = (v: unknown, depth: number): void => {
    if (depth > maxDepth) return;
    if (v === null || v === undefined) return;

    if (typeof v === "number" && wantedKeys.size > 0) {
      // No key context; ignore bare numbers.
      return;
    }

    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }

    if (typeof v !== "object") return;

    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (wantedKeys.has(k) && typeof val === "number" && Number.isFinite(val)) {
        out[k] = val;
      }
      visit(val, depth + 1);
    }
  };

  visit(input, 0);
  return out;
}

function computeRiskMetric(intraday: unknown): { metric: number; normalized: number } {
  const wanted = new Set([
    "spread",
    "volatility",
    "bid",
    "ask",
    "high",
    "low",
    "last",
    "close",
    "open",
  ]);

  const values = scanNumericFields(intraday, wanted);

  // Prefer spread/volatility if provided.
  if (typeof values.spread === "number" && values.spread > 0) {
    const normalized = Math.tanh(values.spread / 0.01);
    return { metric: values.spread, normalized };
  }
  if (typeof values.volatility === "number" && values.volatility > 0) {
    const normalized = Math.tanh(values.volatility);
    return { metric: values.volatility, normalized };
  }

  // If bid/ask exists, derive relative spread.
  if (typeof values.bid === "number" && typeof values.ask === "number") {
    const mid = (values.bid + values.ask) / 2;
    if (mid > 0) {
      const relSpread = Math.abs(values.ask - values.bid) / mid;
      const normalized = Math.tanh(relSpread / 0.01);
      return { metric: relSpread, normalized };
    }
  }

  // If high/low exists, derive range volatility.
  if (typeof values.high === "number" && typeof values.low === "number") {
    const denom = Math.abs(values.high + values.low) / 2;
    if (denom > 0) {
      const rangeVol = Math.abs(values.high - values.low) / denom;
      const normalized = Math.tanh(rangeVol / 0.01);
      return { metric: rangeVol, normalized };
    }
  }

  // Deterministic fallback: hash the response JSON to 0..1.
  const s = JSON.stringify(intraday);
  const digest = createHash("sha256").update(s).digest();
  const first = digest.readUInt32BE(0);
  const normalized = first / 0xffffffff;
  return { metric: normalized, normalized };
}

export async function fetchSolsticeRisk(
  _ctx: PartnerPaymentContext,
): Promise<SolsticeRiskResponse> {
  const intraday = await fetchSixIntradaySnapshot({});
  const { normalized } = computeRiskMetric(intraday);

  // Thresholds are interpreted on the same 0..1 normalized scale.
  const highT = parseThreshold(
    config.SIX_FX_RISK_HIGH_THRESHOLD,
    0.65,
  );
  const mediumT = parseThreshold(
    config.SIX_FX_RISK_MEDIUM_THRESHOLD,
    0.35,
  );

  const fxRiskLabel =
    normalized >= highT ? "HIGH" : normalized >= mediumT ? "MEDIUM" : "LOW";

  // Convert risk into a deterministic AML score bucket (0..255).
  const amlScore = clampU8(normalized * 255);

  return { amlScore, fxRiskLabel };
}
