import { loadWeek } from "./load";
import { clusterRows } from "./cluster";
import { scoreClusters, loadPreferences } from "./score";
import { dedupConfirm } from "./rank";
import { renderDigest } from "./render";
import { sendDigest } from "./send";
import { prisma } from "../db";

/**
 * Phase 2 entrypoint — the Sunday digest.
 * load week → cluster (dedup + coverage) → score + top-k → LLM dedup-confirm →
 * render grouped by category → send via Resend.
 */
export async function runDigest(
  days = 7,
  topK = 20,
): Promise<{ stories: number; sent: boolean; to?: string }> {
  const [rows, prefs] = await Promise.all([loadWeek(days), loadPreferences()]);
  if (rows.length === 0) {
    console.log("[digest] no embedded rows in window — nothing to send");
    return { stories: 0, sent: false };
  }

  const clusters = clusterRows(rows);
  const shortlist = scoreClusters(clusters, prefs, topK);
  const deduped = await dedupConfirm(shortlist);

  const { subject, html } = renderDigest(deduped, prefs);
  const { to, id } = await sendDigest(subject, html);

  console.log(`[digest] sent ${deduped.length} stories to ${to} (id ${id})`);
  return { stories: deduped.length, sent: true, to };
}

