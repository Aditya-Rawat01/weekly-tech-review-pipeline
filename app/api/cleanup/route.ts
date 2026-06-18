import { isAuthorized } from "../../lib/helpers/auth";
import { cleanup } from "../../lib/helpers/cleanup";

export const runtime = "nodejs";
export const maxDuration = 30;
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
