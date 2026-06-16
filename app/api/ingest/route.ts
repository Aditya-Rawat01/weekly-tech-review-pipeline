import { timingSafeEqual } from "crypto";
import { ingest } from "../../lib/ingest";

// Prisma (pg adapter) + crypto need the Node runtime — NOT edge.
export const runtime = "nodejs";
// Ceiling the platform enforces. Vercel Hobby caps at 60s; this is the
// experiment we're testing — whether a full ingest fits inside it.
export const maxDuration = 60;
// Never cache/prerender — this mutates the DB on every call.
export const dynamic = "force-dynamic";

/**
 * Constant-time bearer-token check. A plain `===` leaks the secret via
 * response-timing; timingSafeEqual compares in fixed time. We also length-gate
 * first because timingSafeEqual throws on unequal-length buffers.
 */
function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // fail closed if the secret isn't configured

  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");

  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/ingest — triggered by the GitHub Actions cron every 6h.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 * The pipeline is idempotent (URL-dedup), so a double-fire is harmless.
 */
export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) {
    // Bare 401, no detail about what was expected.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await ingest();
    return Response.json({
      ok: true,
      ...result,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[api/ingest] failed:", err);
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
