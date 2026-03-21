import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * When BACKEND_API_KEY is non-empty, require matching credential on /api routes.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = config.BACKEND_API_KEY?.trim();
  if (!expected) {
    next();
    return;
  }

  const headerKey = req.headers["x-api-key"];
  const auth = req.headers.authorization;
  let provided: string | undefined;
  if (typeof headerKey === "string" && headerKey.length > 0) {
    provided = headerKey;
  } else if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    provided = auth.slice(7).trim();
  }

  if (provided !== expected) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  next();
}
