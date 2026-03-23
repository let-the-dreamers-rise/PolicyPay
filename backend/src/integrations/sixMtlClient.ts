import fs from "fs";
import https from "https";
import { URL } from "url";
import { config } from "../config";
import { IntegrationMisconfiguredError, IntegrationUpstreamError } from "./errors";

export type SixIntradaySnapshotResponse = unknown;

function resolvePathOrThrow(label: string, raw: string): string {
  if (!raw) {
    throw new IntegrationMisconfiguredError(`${label} is not configured`);
  }
  // `process.cwd()` is backend/ when `node dist/index.js` runs from backend.
  return raw;
}

function readPemOrThrow(label: string, filePath: string): Buffer {
  const p = resolvePathOrThrow(label, filePath);
  try {
    return fs.readFileSync(p);
  } catch (e) {
    throw new IntegrationMisconfiguredError(
      `Failed to read ${label} from ${p}`,
    );
  }
}

function readPemFromBase64OrNull(label: string, base64: string | undefined): Buffer | null {
  if (!base64 || base64.trim() === "") return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    throw new IntegrationMisconfiguredError(`${label} is not valid base64`);
  }
}

function readPemFromEnvOrFile(params: {
  base64: string | undefined;
  base64Label: string;
  filePath: string;
  fileLabel: string;
}): Buffer {
  const fromB64 = readPemFromBase64OrNull(params.base64Label, params.base64);
  if (fromB64) return fromB64;
  if (!params.filePath) {
    throw new IntegrationMisconfiguredError(
      `${params.base64Label} or ${params.fileLabel} must be configured`,
    );
  }
  return readPemOrThrow(params.fileLabel, params.filePath);
}

export async function fetchSixIntradaySnapshot(params: {
  idsCsv?: string;
}): Promise<SixIntradaySnapshotResponse> {
  const baseUrl = config.SIX_API_BASE_URL;
  const apiVersion = config.SIX_API_VERSION;
  const certPath = config.SIX_MTLS_CERT_PEM_PATH;
  const keyPath = config.SIX_MTLS_KEY_PEM_PATH;
  const certB64 = process.env.SIX_MTLS_CERT_PEM_BASE64;
  const keyB64 = process.env.SIX_MTLS_KEY_PEM_BASE64;

  if (!baseUrl) {
    throw new IntegrationMisconfiguredError("SIX_API_BASE_URL is not configured");
  }
  if (!apiVersion) {
    throw new IntegrationMisconfiguredError("SIX_API_VERSION is not configured");
  }
  // Prefer env base64, but keep PEM file paths as fallback for local dev.

  const ids = (params.idsCsv ?? config.SIX_FX_SNAPSHOT_IDS ?? "").trim();
  if (!ids) {
    throw new IntegrationMisconfiguredError(
      "SIX_FX_SNAPSHOT_IDS is empty (required to call intradaySnapshot)",
    );
  }

  const cert = readPemFromEnvOrFile({
    base64: certB64,
    base64Label: "SIX_MTLS_CERT_PEM_BASE64",
    filePath: certPath,
    fileLabel: "SIX_MTLS_CERT_PEM_PATH",
  });
  const key = readPemFromEnvOrFile({
    base64: keyB64,
    base64Label: "SIX_MTLS_KEY_PEM_BASE64",
    filePath: keyPath,
    fileLabel: "SIX_MTLS_KEY_PEM_PATH",
  });

  const u = new URL(baseUrl);
  const endpointPath = "/listings/marketData/intradaySnapshot";
  const query = new URLSearchParams({
    scheme: "VALOR_BC",
    ids,
    preferredLanguage: "EN",
  });

  const agent = new https.Agent({
    cert,
    key,
    keepAlive: true,
  });

  const requestUrl = `${u.origin}${endpointPath}?${query.toString()}`;
  const reqUrl = new URL(requestUrl);

  const options: https.RequestOptions = {
    method: "GET",
    protocol: reqUrl.protocol,
    hostname: reqUrl.hostname,
    port: reqUrl.port ? Number(reqUrl.port) : undefined,
    path: `${reqUrl.pathname}${reqUrl.search}`,
    headers: {
      accept: "application/json",
      "api-version": apiVersion,
    },
    agent,
  };

  const timeoutMs = config.PARTNER_HTTP_TIMEOUT_MS;

  return await new Promise<SixIntradaySnapshotResponse>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new IntegrationUpstreamError(
              `SIX intradaySnapshot HTTP ${res.statusCode}`,
              data.slice(0, 500),
            ),
          );
          return;
        }

        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve(parsed as SixIntradaySnapshotResponse);
        } catch (e) {
          reject(
            new IntegrationUpstreamError(
              "SIX intradaySnapshot returned non-JSON response",
              data.slice(0, 500),
            ),
          );
        }
      });
    });

    req.on("error", (err) => {
      reject(new IntegrationUpstreamError("SIX intradaySnapshot request failed", err));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("SIX intradaySnapshot request timed out"));
    });

    req.end();
  });
}

