import path from "path";
import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See backend/.env.example.`,
    );
  }
  return String(v).trim();
}

function requireEnvInt(name: string): number {
  const v = requireEnv(name);
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid integer for environment variable ${name}: ${v}`);
  }
  return n;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function envInt(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

/** Resolve IDL path relative to backend cwd (where `node` is started). */
function resolveIdlPath(raw: string): string {
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/**
 * Core settings: no fallbacks — set them in `.env` (see `.env.example`).
 *
 * `BACKEND_API_KEY`: optional shared secret. If set, clients must send
 * `x-api-key: <value>` or `Authorization: Bearer <value>`. Generate any strong
 * random string, e.g. `openssl rand -hex 32` or Node `require('crypto').randomBytes(32).toString('hex')`.
 * Leave empty to disable API key checks (not recommended for public deployments).
 */
export const config = {
  PORT: requireEnvInt("PORT"),
  MONGODB_URI: requireEnv("MONGODB_URI"),
  SOLANA_RPC_URL: requireEnv("SOLANA_RPC_URL"),
  PROGRAM_ID: requireEnv("PROGRAM_ID"),
  COMPLIANCE_ISSUER_SECRET_KEY: requireEnv("COMPLIANCE_ISSUER_SECRET_KEY"),
  IDL_PATH: resolveIdlPath(requireEnv("IDL_PATH")),

  BACKEND_API_KEY: process.env.BACKEND_API_KEY?.trim() || "",

  USE_ONCHAIN_POLICY: envBool("USE_ONCHAIN_POLICY", false),

  PARTNER_HTTP_TIMEOUT_MS: envInt("PARTNER_HTTP_TIMEOUT_MS", 15_000),

  AMINA_API_URL: process.env.AMINA_API_URL?.trim() || "",
  AMINA_API_KEY: process.env.AMINA_API_KEY?.trim() || "",

  SOLSTICE_API_URL: process.env.SOLSTICE_API_URL?.trim() || "",
  SOLSTICE_API_KEY: process.env.SOLSTICE_API_KEY?.trim() || "",

  KEYROCK_API_URL: process.env.KEYROCK_API_URL?.trim() || "",
  KEYROCK_API_KEY: process.env.KEYROCK_API_KEY?.trim() || "",

  FIREBLOCKS_SIM_URL: process.env.FIREBLOCKS_SIM_URL?.trim() || "",
  FIREBLOCKS_SIM_API_KEY: process.env.FIREBLOCKS_SIM_API_KEY?.trim() || "",

  ENABLE_FIREBLOCKS_GATE: envBool("ENABLE_FIREBLOCKS_GATE", false),

  KYT_API_URL: process.env.KYT_API_URL?.trim() || "",
  KYT_API_KEY: process.env.KYT_API_KEY?.trim() || "",

  KYT_MAX_TX_PER_DAY: envInt("KYT_MAX_TX_PER_DAY", 1000),
  KYT_MAX_VOLUME_PER_DAY: envInt("KYT_MAX_VOLUME_PER_DAY", Number.MAX_SAFE_INTEGER),
} as const;
