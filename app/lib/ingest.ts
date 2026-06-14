import { fetchAllFeeds } from "./fetch-feeds";
import { canonicalizeUrl } from "./clean";
import { prisma } from "./db";

/**
 * Phase 1 ingest — intended to run on a cron every 6h.
 * fetch all feeds -> canonicalize URLs -> drop empties / in-batch dup URLs
 * -> insert, skipping rows whose URL already exists (DB unique constraint).
 *
 * No scoring or ranking here — that happens in the Sunday digest pass.
 * (Embedding + LLM categorization are the next ingest slices; they belong
 * here, not on Sunday, because they're permanent and user-independent.)
 * This step is cheap and idempotent: a missed run just gets picked up next
 * cycle, and re-running never double-inserts.
 */
export async function ingest(): Promise<{ fetched: number; inserted: number }> {
  const items = await fetchAllFeeds();

  // Canonicalize, validate non-empty, dedup within this batch by URL.
  const seen = new Set<string>();
  const rows = [];
  for (const item of items) {
    const url = canonicalizeUrl(item.link);
    if (!url || !item.title) continue; // validate non-empty
    if (seen.has(url)) continue; // in-batch dup
    seen.add(url);

    rows.push({
      title: item.title,
      url,
      description: item.contentSnippet,
      source: item.source,
      // isoDate is normalized by rss-parser; fall back to now() if absent.
      published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
    });
  }

  // skipDuplicates relies on the unique index on Article.url to drop rows we
  // already have from a previous run.
  const result = await prisma.article.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { fetched: items.length, inserted: result.count };
}

// Allow running directly: `npx tsx app/lib/ingest.ts`
if (process.argv[1] && process.argv[1].endsWith("ingest.ts")) {
  ingest()
    .then(({ fetched, inserted }) => {
      console.log(`[ingest] fetched ${fetched}, inserted ${inserted} new`);
    })
    .catch((err) => {
      console.error("[ingest] failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
