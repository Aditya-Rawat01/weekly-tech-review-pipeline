import { fetchAllFeeds } from "./fetch-feeds";
import { canonicalizeUrl } from "../helpers/clean";
import { categorizeAll } from "./categorize";
import { embedArticles } from "./embed";
import { prisma } from "../clients/db";

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
    const candidates = [];
    for (const item of items) {
        const url = canonicalizeUrl(item.link);
        if (!url || !item.title) continue; // validate non-empty
        if (seen.has(url)) continue; // in-batch dup
        seen.add(url);
        candidates.push({
            title: item.title,
            url,
            description: item.contentSnippet,
            source: item.source,
            // isoDate is normalized by rss-parser; fall back to now() if absent.
            published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
        });
    }

    // Drop URLs already in the DB BEFORE categorizing, so we never spend LLM
    // tokens on stories we already have.
    const existing = await prisma.article.findMany({
        where: { url: { in: candidates.map((c) => c.url) } },
        select: { url: true },
    });
    const existingUrls = new Set(existing.map((e) => e.url));
    const fresh = candidates.filter((c) => !existingUrls.has(c.url));

    if (fresh.length === 0) {
        return { fetched: items.length, inserted: 0 };
    }

    // Categorize and embed the fresh rows. These are independent (Groq vs Jina,
    // neither consumes the other's output), so run them in parallel — total
    // latency becomes max(categorize, embed) instead of the sum.
    const [categories, embeddings] = await Promise.all([
        categorizeAll(
            fresh.map((f) => ({ title: f.title, description: f.description })),
        ),
        embedArticles(
            fresh.map((f) => ({
                title: f.title,
                description: f.description ?? "",
            })),
        ),
    ]);

    // Single bulk upsert. Prisma's createMany can't write the Unsupported
    // ("vector") column, so we build one parameterized multi-row INSERT.
    // 7 bound params per row (id is generated server-side); Postgres caps at
    // ~65535 params, so this stays safe well past our ~hundreds-per-run volume.
    const COLS_PER_ROW = 7;
    const EMBED_DIM = 768;
    const values: unknown[] = [];
    const tuples: string[] = [];

    fresh.forEach((f, i) => {
        const vec = embeddings[i];
        // A row's embedding MUST be a full 768-dim vector. A missing/short one
        // (e.g. a partial Jina response) makes pgvector reject a dimension
        // mismatch — and since this is ONE multi-row statement, a single bad row
        // would abort the entire insert and lose every fresh row this cycle. Skip
        // the bad row instead; it self-heals next cycle.
        if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
            console.warn(
                `[ingest] skipping ${f.url} — invalid embedding (len ${vec?.length ?? 0})`,
            );
            return;
        }
        const cats = categories[i] ?? [];
        // Offset is based on rows ALREADY included (tuples.length), not i, so
        // placeholder indices stay contiguous even when rows above were skipped.
        const base = tuples.length * COLS_PER_ROW;
        tuples.push(
            `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::"CATEGORY"[], $${base + 7}::vector)`,
        );
        values.push(
            f.title,
            f.url,
            f.description ?? "",
            f.source,
            f.published_at,
            `{${cats.join(",")}}`, // Postgres array literal for CATEGORY[]
            `[${vec.join(",")}]`, // pgvector literal
        );
    });

    // Everything got filtered out (all embeddings invalid) — nothing to insert.
    if (tuples.length === 0) {
        return { fetched: items.length, inserted: 0 };
    }

    const sql =
        `INSERT INTO "Article" (id, title, url, description, source, published_at, category, embedding) ` +
        `VALUES ${tuples.join(", ")} ` +
        `ON CONFLICT (url) DO NOTHING`;

    // $executeRawUnsafe with bound params: values are parameterized (not
    // interpolated), so this is injection-safe. Only the placeholder structure
    // is built from our own trusted indices.
    const inserted = await prisma.$executeRawUnsafe(sql, ...values);

    return { fetched: items.length, inserted };
}

// Allow running directly: `npx tsx app/lib/ingest.ts`
if (process.argv[1] && process.argv[1].endsWith("ingest.ts")) {
    ingest()
        .then(({ fetched, inserted }) => {
            console.log(
                `[ingest] fetched ${fetched}, inserted ${inserted} new`,
            );
        })
        .catch((err) => {
            console.error("[ingest] failed:", err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
