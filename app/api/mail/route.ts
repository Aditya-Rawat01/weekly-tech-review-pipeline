import { runDigest } from "@/app/lib/digest-pipeline";
import { isAuthorized } from "../../lib/helpers/auth";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/mail — triggered weekly (Sunday cron).
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same secret as ingest/cleanup).
 * Builds + sends the weekly digest: load → cluster → score → dedup-confirm →
 * render → send via Resend. NOT idempotent — re-firing sends another copy
 * (the weekly cadence + concurrency group make that unlikely).
 */
export async function POST(req: Request): Promise<Response> {
    if (!isAuthorized(req)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    try {
        const data = await runDigest();
        return Response.json({ ok: true, data });
    } catch (err) {
        console.error("[api/mail] failed:", err);
        return Response.json(
            { ok: false, error: (err as Error).message },
            { status: 500 },
        );
    }
}
