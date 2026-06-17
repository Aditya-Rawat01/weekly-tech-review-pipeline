import { isAuthorized } from "../../lib/auth";
import { cleanup } from "../../lib/cleanup";

// Prisma (pg adapter) + crypto need the Node runtime — NOT edge.
export const runtime = "nodejs";
export const maxDuration = 30;
// Never cache/prerender — this mutates the DB.
export const dynamic = "force-dynamic";

/**
 * POST /api/cleanup — triggered weekly (GitHub Actions cron).
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same secret as ingest).
 * Deletes articles older than 2 weeks. Idempotent: a double-fire just deletes
 * nothing the second time.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await cleanup();
    return Response.json({ ok: true, deleted });
  } catch (err) {
    console.error("[api/cleanup] failed:", err);
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
