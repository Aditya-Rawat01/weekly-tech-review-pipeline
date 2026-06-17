import { timingSafeEqual } from "crypto";

/**
 * Constant-time Bearer-token check against CRON_SECRET, shared by the
 * cron-triggered routes (/api/ingest, /api/cleanup).
 *
 * - Fails closed if CRON_SECRET is unset.
 * - timingSafeEqual (not `===`) so response timing can't leak the secret;
 *   length-gated first because it throws on unequal-length buffers.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
