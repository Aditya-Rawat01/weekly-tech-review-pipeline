import type { Cluster } from "./cluster";
import { prisma } from "../clients/db";

export type ScoredCluster = {
    cluster: Cluster;
    score: number;
    coverage: number; // = clusterSize
    recency: number; // 0..1 (fraction of the window still "fresh")
    preferenceMatch: boolean;
    categories: string[]; // union of member categories
};

/**
 * Tunable weights. Coverage-dominant on purpose: a story covered by multiple
 * outlets is objectively one of the week's biggest, and must not be buried by
 * preference weight (README fragility note). Preference and recency mainly
 * order the long tail of single-source stories, which all share coverage = 1.
 */
const WEIGHTS = { coverage: 2.0, recency: 1.0, preference: 1.5 };
const WINDOW_HOURS = 7 * 24;

/** Preferences from the singleton User row. Empty set if no user / no prefs —
 *  scoring then falls back to coverage + recency (graceful absence). */
export async function loadPreferences(): Promise<Set<string>> {
    const user = await prisma.user.findFirst({ select: { preferences: true } });
    return new Set(user?.preferences ?? []);
}

function unionCategories(c: Cluster): string[] {
    const s = new Set<string>();
    for (const m of c.members) for (const cat of m.category) s.add(cat);
    return [...s];
}

/** Freshness of the cluster's most-recent coverage, linearly decayed over the
 *  window (1 = just now, 0 = a week old). */
function recencyScore(c: Cluster, now: number): number {
    const newest = Math.max(...c.members.map((m) => m.published_at.getTime()));
    const ageHours = (now - newest) / 3.6e6;
    return Math.max(0, 1 - ageHours / WINDOW_HOURS);
}

/**
 * Score every cluster and return the top-k, highest first. Pure arithmetic —
 * no LLM. `topK` is kept generous so the downstream dedup-confirm has room and
 * a borderline major story isn't cut.
 */
export function scoreClusters(
    clusters: Cluster[],
    preferences: Set<string>,
    topK = 20,
    now = Date.now(),
): ScoredCluster[] {
    const scored = clusters.map((cluster): ScoredCluster => {
        const categories = unionCategories(cluster);
        const preferenceMatch = categories.some((c) => preferences.has(c));
        const coverage = cluster.size;
        const recency = recencyScore(cluster, now);
        const score =
            WEIGHTS.coverage * coverage +
            WEIGHTS.recency * recency +
            WEIGHTS.preference * (preferenceMatch ? 1 : 0);
        return {
            cluster,
            score,
            coverage,
            recency,
            preferenceMatch,
            categories,
        };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
