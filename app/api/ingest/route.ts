import { isAuthorized } from "../../lib/helpers/auth";
import { ingest } from "../../lib/ingest-pipeline/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;
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
