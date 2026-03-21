import {
  IntegrationMisconfiguredError,
  IntegrationUpstreamError,
} from "../integrations/errors";

export function httpErrorFromUnknown(err: unknown): { status: number; message: string } {
  if (err instanceof IntegrationMisconfiguredError) {
    return { status: err.statusCode, message: err.message };
  }
  if (err instanceof IntegrationUpstreamError) {
    return { status: err.statusCode, message: err.message };
  }
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      return {
        status: 409,
        message: "Conflict: duplicate idempotency key",
      };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 400, message };
}
