# Weekly Tech News Digest

Self-hosted personal pipeline: ingest tech news every 6h all week, email a
grouped digest every Sunday via Resend. Node + TypeScript, run with `tsx`,
Prisma + Neon Postgres for storage. Runs indefinitely, so ongoing cost must
stay near $0.

> This README doubles as the project's running state log — what's decided,
> what's built, what's verified, and what's next.

---

## Architecture (two phases)

**Phase 1 — Ingest (cron, every 6h). No ranking.**
fetch RSS → clean → canonicalize URL → URL-dedup against DB → categorize new
items (LLM) → store. Cheap and idempotent: a missed run self-heals next cycle;
re-running never double-inserts.

**Phase 2 — Digest (cron, Sunday, once). The smart pass.**
load week's rows → cluster by embeddings (dedup + coverage count) → score &
cut to top-k (cheap arithmetic) → one LLM call to dedup-confirm + rank →
render grouped by category → send via Resend.

### Why work is split the way it is
- **Cheap/idempotent early, expensive/preference-dependent late.**
- **Categorize at ingest** — category is permanent and user-independent, so
  compute once; never goes stale when preferences change.
- **Cluster + rank on Sunday** — needs the whole week at once (duplicates from
  different sites arrive in different 6h windows) and the *current* preferences.
- **Two dedup nets:** embeddings (recall, whole week) → LLM (precision, small
  shortlist). Misses by embeddings are recoverable if both copies reach the
  shortlist.
- **clusterSize = self-derived popularity** (how many sites covered a story),
  replacing the HN points signal we dropped.

---

## Sources

| Source | Feed | Site-specific handling |
|---|---|---|
| TechCrunch | `techcrunch.com/feed/` | filter out the recurring "TechCrunch Mobility" newsletter column (URL slug `techcrunch-mobility-`) — boilerplate intro, no real story snippet |
| Ars Technica | `feeds.arstechnica.com/arstechnica/index` | **section allowlist** on URL path (`ai, security, tech-policy, gadgets, google`); fails closed, drops culture/science/health/cars/space |
| VentureBeat | `venturebeat.com/feed/` | snippet is the **full article body** → truncate to first 2 sentences |

**Dropped:** The Verge (Atom feed, broad topics, image-caption leaks that can't
be cleaned deterministically — undermines zero-hallucination), Hacker News
(aggregator with no content of its own; titles + points only).

### Cleaning pipeline (shared, per item)
strip HTML → `he.decode()` → normalize whitespace (`\u00A0`→space, collapse
runs) → trim trailing ellipsis → canonicalize URL (drop query/hash) → filter
junk (`/video/`, `post_type=`) → URL-dedup → validate non-empty.

---

## File structure

```
app/lib/
  clean.ts        Shared once: NewsItem type, cleanText, canonicalizeUrl, isJunkLink
  sources.ts      Per-source config — Ars allowlist + VB sentence-split live here
                  (site-specific logic is NOT generalized into the runner)
  fetch-feeds.ts  Generic runner: parallel fetch, per-feed try/catch,
                  keepAlive:false agent (so the process exits cleanly)
  db.ts           Prisma client singleton (pg adapter + Neon)
  groq.ts         LLM client — OpenAI SDK pointed at Groq (provider-agnostic),
                  complete() with retry/backoff for 429 / 5xx
  categorize.ts   categorizeBatch (1 LLM call, strict enum-validated, index-aligned)
                  + categorizeAll (chunks into batches of 15)
  embed.ts        Jina Embeddings API client (jina-embeddings-v2-base-en, 768-dim);
                  embedTexts + embedArticles (title+description, batches of 64,
                  retry/backoff for 429 / 5xx)
  ingest.ts       Phase 1 entrypoint: fetch → canonicalize → dedup →
                  categorize + embed fresh only → single bulk raw-SQL upsert
                  (multi-row INSERT … ON CONFLICT (url) DO NOTHING)
  cleanup.ts      Delete articles older than 2 weeks (single deleteMany)

app/api/
  ingest/route.ts POST handler — Bearer-secret auth (timingSafeEqual), Node
                  runtime, maxDuration=60; calls ingest(). The cron's entrypoint.

.github/workflows/
  ingest.yml      GitHub Actions cron (every 6h UTC + manual dispatch) that
                  curls /api/ingest with the shared secret; fails on non-200.

prisma/
  schema.prisma   Article + User models, CATEGORY enum (11 labels),
                  embedding Unsupported("vector(768)")
  migrations/     init + add_embedding_vector (pgvector extension + column)

app/generated/prisma/   Generated client (output configured in schema)
```

### Data model (Prisma)
- `Article`: id, title, url (unique), description (cleaned snippet), source,
  published_at, summary (nullable, **unused for now**), category (CATEGORY[]),
  embedding (`vector(768)`, pgvector — title+description, for Sunday clustering),
  created_at.
- `User` (singleton on self-hosted): id, email (unique), preferences (CATEGORY[]).
- `CATEGORY` enum: ai, webdev, saas, hardware, software, llm, startup, backend,
  security, cloud, mobile.

---

## Key decisions log

- **Embeddings via Jina API, not a local model.** A local ONNX model
  (Transformers.js, ~45–80MB weights) bloats the Vercel bundle and pays a cold-
  start load cost every invocation. Jina's hosted API needs no weights, returns
  768-dim vectors in one HTTP call, and its 10M-token free grant is effectively
  unlimited here (~15K tokens/week → 12+ years). `jina-embeddings-v2-base-en`
  chosen over v3/v5: English-only feeds, smallest model, Apache-2.0, 768-dim
  matches the column. Same provider-swap freedom as the Groq client (it's just
  one module).
- **Bulk raw-SQL upsert for embeddings.** Prisma's `createMany` can't write the
  `Unsupported("vector")` column, and per-row inserts mean N network round-trips
  to Neon. Instead: one parameterized multi-row `INSERT … ON CONFLICT (url) DO
  NOTHING`. Values are bound (injection-safe); only placeholder indices are
  built from trusted code. ~7 params/row keeps us far under Postgres's 65535 cap.
- **No article extraction.** Rejected Jina Reader (one-time token grant
  depletes) and self-scraping (hallucination risk). LLM only rephrases
  title+snippet, never expands.
- **`summary` left unused.** Each source's cleaned `description` is already a
  tight 1–2 line summary; the email renders from `description`. No rephrasing
  in the pipeline (Sunday = rank, not rephrase). Revisit only if the digest
  looks inconsistent across sources.
- **Dates:** store `item.isoDate` (rss-parser normalizes it across feeds).
  `published_at` = feed time, `created_at` = ingest time. Fallback `new Date()`
  only when isoDate absent.
- **Real cron, not recursive setTimeout** (setTimeout drifts / skips windows on
  restart). DB dedup makes a missed run harmless.
- **Cron via GitHub Actions, not Vercel Cron.** Vercel Cron on the Hobby tier
  fires at most once per day — too coarse for a 6h cadence. GitHub Actions
  (`0 */6 * * *`, UTC) hits a Vercel route handler (`/api/ingest`) instead.
  Caveat: GitHub's scheduler is best-effort (can lag minutes under load, and
  auto-disables after 60 days of repo inactivity) — fine here because the
  pipeline self-heals on the next cycle. The pipeline runs *on Vercel* (the
  route calls `ingest()`); the Action is just the trigger. Measured ~3.8s for a
  no-op cycle, well under the 60s `maxDuration` ceiling.
- **Endpoint auth: shared secret, constant-time compare.** `/api/ingest`
  requires `Authorization: Bearer $CRON_SECRET`, checked with
  `crypto.timingSafeEqual` (a plain `===` leaks the secret via response timing).
  Fails closed if the env var is unset; returns a bare 401. Route is pinned to
  the **Node runtime** (Prisma/pg + `crypto` can't run on Edge) and
  `dynamic = "force-dynamic"` (never cached — it mutates the DB). Considered
  Vercel Cron's auto-injected secret (not viable on Hobby's once-a-day) and
  QStash HMAC signing (stronger, but over-engineered for a personal pipeline).
- **LLM: Groq via OpenAI-compatible API, no LangChain.** Pipeline has zero
  orchestration complexity (two single-shot JSON calls), so a framework would
  be pure overhead. OpenAI SDK + `baseURL`=Groq keeps it provider-agnostic
  (one-line switch). Strict prompts + output validation against the enum.
- **Model: `llama-3.3-70b-versatile`, not `gpt-oss`.** The `gpt-oss` models
  (20B *and* 120B) are reasoning models (harmony format); forcing
  `response_format: json_object` collides with their reasoning channels and
  Groq returns `json_validate_failed` (empty generation). A bigger gpt-oss
  doesn't fix it. For strict-JSON classification at temp 0 you want a
  non-reasoning instruction-tuned model — `llama-3.3-70b-versatile` produces
  clean JSON reliably. Swappable via `GROQ_MODEL`.
- **Categorization rules:** always returns an array (even for one label),
  strictly validated against the Prisma enum, invalid/invented labels dropped,
  small batches (15) for reliability. A failed LLM call (non-retryable error
  like `json_validate_failed`) degrades that batch to `[]` rather than
  crashing ingest — the article is still stored + embedded, just uncategorized.

---

## Status

### Done & verified
- [x] Source finalization (TechCrunch, Ars, VentureBeat); Verge + HN dropped.
- [x] Per-source cleaning (Ars allowlist, VB 2-sentence truncation) — verified
      against live feeds + stored rows.
- [x] Consolidated feed runner; shared helpers defined once.
- [x] keepAlive socket fix (VentureBeat kept the process alive otherwise).
- [x] Prisma client (pg adapter + Neon); `prisma generate` → app/generated/prisma.
- [x] Phase 1 ingest: fetch → canonicalize → dedup → insert. Verified
      idempotent (re-run inserts 0).
- [x] Groq client with retry/backoff.
- [x] LLM categorization at ingest (only on fresh rows, to save tokens) —
      verified end-to-end: 38/38 fresh rows labeled (e.g. `{hardware,ai}`,
      `{security}`, `{mobile,ai}`). Model is `llama-3.3-70b-versatile` (see
      decisions log); `categorizeBatch` now degrades a failed batch to `[]`
      instead of crashing the run.
- [x] DB cleanup: delete articles older than 2 weeks (`cleanup.ts`).
- [x] **Embeddings at ingest** (`embed.ts`): Jina Embeddings API
      (`jina-embeddings-v2-base-en`, 768-dim), title+description concatenated,
      batches of 64, retry/backoff. Categorize + embed run in parallel
      (`Promise.all`); stored via a single bulk raw-SQL upsert in `ingest.ts`
      (pgvector column). **Verified live:** `migrate deploy` applied the
      pgvector column, one ingest cycle wrote 38 rows all with 768-dim vectors,
      re-run inserted 0 (idempotent).
- [x] **Secured ingest endpoint** (`app/api/ingest/route.ts`): POST, Bearer
      `CRON_SECRET` via `timingSafeEqual`, Node runtime, `maxDuration=60`,
      `force-dynamic`. `next build` clean (route is `ƒ /api/ingest`). Local
      smoke test: no-auth→401, wrong→401, GET→405, correct→200 with a full
      ingest in ~3.8s.
- [x] **Ingest cron trigger** (`.github/workflows/ingest.yml`): GitHub Actions
      `0 */6 * * *` (UTC) + manual dispatch, curls the endpoint with the secret,
      fails the job on non-200. *Deployment pending: needs Vercel deploy +
      `CRON_SECRET`/`INGEST_URL` secrets set — validating overnight via the
      Actions logs.*

### Next
- [ ] **Sunday digest job:**
  - [ ] cluster by cosine distance (tight threshold ~0.15) → dedup + clusterSize
  - [ ] score (preference match + clusterSize + recency) → top-k shortlist
  - [ ] one LLM call: dedup-confirm + rank the shortlist
  - [ ] render grouped by category
  - [ ] send via Resend
- [ ] **Sunday digest trigger**: a second workflow (`0 8 * * 0` UTC or similar)
      hitting a `/api/digest` endpoint, same auth pattern as ingest.
- [ ] **Cleanup wiring**: run `cleanup.ts` (or a `/api/cleanup` route) on a
      daily/weekly schedule.
- [ ] **User preferences**: seed the singleton User row.

### Known fragilities to watch
- Step-3 cut has no LLM safety net — keep k generous; don't let preference
  weight bury a high-clusterSize major story.
- Clustering threshold needs tuning (too loose → single-linkage chaining; too
  tight → missed dups). Start tight.
- coverage signal is coarse (only 3 sources → clusterSize maxes at 3).
- URL canonicalization is load-bearing for the "~300/week not 1120" volume
  estimate; verify tracking-param variants collapse.
- Free-model categorization may drift; mitigated by strict prompt + enum
  validation + temperature 0.

---

## Running

```bash
# one ingest cycle (fetch + categorize + embed + store)
npx tsx app/lib/ingest.ts

# delete articles older than 2 weeks
npx tsx app/lib/cleanup.ts

# apply pending migrations (e.g. the pgvector embedding column)
npx prisma migrate deploy

# regenerate Prisma client after schema changes
npx prisma generate
```

### Env (`.env`)
- `DATABASE_URL` — Neon Postgres connection string.
- `GROQ_API_KEY` — from https://console.groq.com/keys
- `GROQ_MODEL` — default `llama-3.3-70b-versatile`.
- `JINA_API_KEY` — from https://jina.ai/?sui=apikey (10M-token free grant).
- `CRON_SECRET` — shared secret guarding `/api/ingest`. Generate a random
  string (e.g. `openssl rand -hex 32`).
```

### Deployment secrets (cron trigger)
The same `CRON_SECRET` value must live in two places:
- **Vercel** → project env var `CRON_SECRET` (so the route can verify it).
- **GitHub** → repo secret `CRON_SECRET` (so the Action can send it), plus
  `INGEST_URL` = the deployed URL + `/api/ingest`
  (e.g. `https://<app>.vercel.app/api/ingest`).

Trigger manually anytime from the repo's **Actions → ingest → Run workflow**
(`workflow_dispatch`); otherwise it runs every 6h. Each run's HTTP status and
the JSON response body are printed in the Action log, and a non-200 fails the
job (red X).
