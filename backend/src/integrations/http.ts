import { config } from "../config";
import { IntegrationUpstreamError } from "./errors";

export type Json = Record<string, unknown>;

export async function postPartnerJson<T extends Json>(
  url: string,
  apiKey: string | undefined,
  body: Json,
): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.PARTNER_HTTP_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new IntegrationUpstreamError(
        `Partner returned non-JSON (${res.status})`,
      );
    }

    if (!res.ok) {
      throw new IntegrationUpstreamError(
        `Partner HTTP ${res.status}: ${typeof (data as Json).error === "string" ? (data as Json).error : text.slice(0, 200)}`,
      );
    }

    return data as T;
  } catch (e) {
    if (e instanceof IntegrationUpstreamError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new IntegrationUpstreamError("Partner request timed out");
    }
    throw new IntegrationUpstreamError(
      e instanceof Error ? e.message : "Partner request failed",
      e,
    );
  } finally {
    clearTimeout(t);
  }
}
