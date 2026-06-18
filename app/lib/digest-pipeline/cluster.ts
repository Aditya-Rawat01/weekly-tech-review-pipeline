import type { WeekRow } from "./load";

/** A deduped story: the chosen representative row + every row that clustered
 *  with it. `size` is the coverage signal (how many articles/sites covered it). */
export type Cluster = {
  representative: WeekRow;
  members: WeekRow[];
  size: number;
};

/** Cosine similarity of two equal-length vectors. Jina v2 vectors aren't
 *  guaranteed unit-normalized, so divide by the norms explicitly. */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Cluster rows whose embeddings are within `distanceThreshold` cosine distance
 * (distance = 1 − similarity). Union-find (single-linkage): if A~B and B~C,
 * all three merge. That's why the threshold is tight (0.15 → 0.85 similarity)
 * — loose thresholds chain unrelated stories together.
 *
 * O(n²) pairwise — fine for the ~hundreds of rows in a week.
 *
 * Representative = earliest-published member (the outlet that broke the story).
 * Members are sorted earliest-first so ties are stable.
 */
export function clusterRows(rows: WeekRow[], distanceThreshold = 0.15): Cluster[] {
  const n = rows.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number =>
    parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const simThreshold = 1 - distanceThreshold;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosineSim(rows[i].embedding, rows[j].embedding) >= simThreshold) {
        union(i, j);
      }
    }
  }

  // Group indices by their root label.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root) ?? [];
    g.push(i);
    groups.set(root, g);
  }

  const clusters: Cluster[] = [];
  for (const idxs of groups.values()) {
    const members = idxs
      .map((i) => rows[i])
      .sort((a, b) => a.published_at.getTime() - b.published_at.getTime());
    clusters.push({
      representative: members[0],
      members,
      size: members.length,
    });
  }

  // Biggest stories (most coverage) first; this is just a stable default order.
  clusters.sort((a, b) => b.size - a.size);
  return clusters;
}
