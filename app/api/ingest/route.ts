import { isAuthorized } from "../../lib/auth";
import { ingest } from "../../lib/ingest";

// Prisma (pg adapter) + crypto need the Node runtime — NOT edge.
export const runtime = "nodejs";
// Ceiling the platform enforces. Vercel Hobby caps at 60s; this is the
// experiment we're testing — whether a full ingest fits inside it.
export const maxDuration = 60;
// Never cache/prerender — this mutates the DB on every call.
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest — triggered by the cron (EasyCron / GitHub) every 6h.
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 * The pipeline is idempotent (URL-dedup), so a double-fire is harmless.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
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
