import { complete } from "../groq";
import type { ScoredCluster } from "./score";
import type { Cluster } from "./cluster";

/**
 * The "precision net". Embedding clustering (recall, tight 0.85 sim) can miss
 * same-story pairs worded differently. This is ONE LLM call over the small
 * shortlist that flags those leftovers so the email shows no visible dups.
 *
 * It does NOT rank (math already did) and NOT rewrite text (zero-hallucination):
 * it only returns groups of indices that report the same story.
 */
const SYSTEM_PROMPT = `You are a strict news de-duplication assistant. You receive a numbered list of tech-news stories (title + summary). Some entries may describe THE SAME underlying news event, just from different outlets or with different wording.

Identify groups of entries that report the SAME specific story.

RULES:
- Group ONLY entries about the same specific event/announcement/release. Do NOT group entries that merely share a topic, company, or theme.
- Most entries are unique and must NOT be grouped.
- Each index belongs to at most one group. Do not list singletons.
- Output JSON only — no prose, no explanation.

OUTPUT FORMAT (JSON object only):
{"duplicates": [[2, 5], [9, 11, 12]]}
If there are no duplicates, return {"duplicates": []}.`;

function buildUserMessage(shortlist: ScoredCluster[]): string {
  const lines = shortlist.map((s, i) => {
    const r = s.cluster.representative;
    return `${i}. TITLE: ${r.title}\n   SUMMARY: ${r.description || "(none)"}`;
  });
  return `De-duplicate these ${shortlist.length} stories:\n\n${lines.join("\n\n")}`;
}

/** Merge cluster `b` into `a`: combine members (dedup by id), recompute size. */
function mergeClusters(a: Cluster, b: Cluster): Cluster {
  const seen = new Set(a.members.map((m) => m.id));
  const members = [...a.members];
  for (const m of b.members) if (!seen.has(m.id)) members.push(m);
  members.sort((x, y) => x.published_at.getTime() - y.published_at.getTime());
  return { representative: a.representative, members, size: members.length };
}

/**
 * Returns the shortlist with LLM-confirmed duplicates merged out, preserving
 * the original (score) order. Fails safe: any error or malformed output leaves
 * the shortlist unchanged.
 */
export async function dedupConfirm(
  shortlist: ScoredCluster[],
): Promise<ScoredCluster[]> {
  if (shortlist.length <= 1) return shortlist;

  let content: string;
  try {
    content = await complete(SYSTEM_PROMPT, buildUserMessage(shortlist), {
      temperature: 0,
      json: true,
    });
  } catch (err) {
    console.warn(
      "[rank] dedup-confirm LLM call failed, keeping shortlist as-is:",
      (err as Error).message,
    );
    return shortlist;
  }

  let parsed: { duplicates?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    console.warn("[rank] non-JSON dedup response, keeping shortlist as-is");
    return shortlist;
  }

  const groups = Array.isArray(parsed.duplicates) ? parsed.duplicates : [];
  const drop = new Set<number>();
  // map of keep-index -> merged ScoredCluster (so coverage attribution is whole)
  const merged = new Map<number, ScoredCluster>();

  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const idxs = [
      ...new Set(
        group.filter(
          (n): n is number =>
            Number.isInteger(n) && n >= 0 && n < shortlist.length,
        ),
      ),
    ].sort((a, b) => a - b);
    if (idxs.length < 2) continue;

    const keep = idxs[0]; // best-ranked survives
    const base = merged.get(keep) ?? shortlist[keep];
    let cluster = base.cluster;
    for (const i of idxs.slice(1)) {
      cluster = mergeClusters(cluster, shortlist[i].cluster);
      drop.add(i);
    }
    merged.set(keep, { ...base, cluster, coverage: cluster.size });
  }

  return shortlist
    .map((s, i) => merged.get(i) ?? s)
    .filter((_, i) => !drop.has(i));
}
