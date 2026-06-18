# Weekly Tech News Digest

A self-hosted pipeline that ingests tech news from RSS feeds every 6 hours all
week, then emails one clean, de-duplicated, ranked digest every Sunday — grouped
by the topics you care about.

Built to run **at near-zero cost indefinitely**: it stitches together the free
tiers of Neon, Groq, Jina, Resend, Vercel, EasyCron, and GitHub Actions. No
ranking platform, no tracking, no ads — you own the sources, the filters, and
the ranking.

- **Stack:** Node + TypeScript, Next.js route handlers on Vercel, Prisma + Neon
  Postgres (pgvector).
- **LLM:** Groq (`llama-3.3-70b-versatile`) for categorization + dedup.
- **Embeddings:** Jina (`jina-embeddings-v2-base-en`, 768-dim) for clustering.
- **Email:** Resend.

The whole pipeline runs in production as **Bearer-secured Vercel route handlers
driven by external schedulers** — nothing is run by hand.

---

## How it works

The pipeline is split into two phases by a single principle: **do the cheap,
permanent, user-independent work early and often; defer the expensive,
preference-dependent work to one weekly pass.**

### Phase 1 — Ingest (every 6 hours)

```
fetch RSS → clean → canonicalize URL → dedup vs DB → categorize + embed (fresh only) → bulk upsert
```

- **Cheap and idempotent.** A missed run self-heals next cycle; re-running never
  double-inserts (URL is unique).
- **Categorize + embed only fresh rows** (not already in the DB), so no LLM or
  embedding tokens are spent on stories we already have. The two run in parallel.
- **Categorization is permanent** (topic doesn't change), so it's computed once
  at ingest — never goes stale when preferences change.

### Phase 2 — Digest (Sundays)

```
load week's rows → cluster by embedding (dedup + coverage count)
  → score & cut to top-k → LLM dedup-confirm → render grouped by category → send via Resend
```

- **Two dedup nets:** embeddings cluster the whole week (recall, tight 0.15
  cosine distance), then one LLM call confirms any near-duplicates the tight
  threshold missed (precision). The LLM only returns indices — it never
  rewrites content (zero-hallucination).
- **`clusterSize` = self-derived popularity:** how many sources covered a story.
- **Scoring is pure arithmetic:** `coverage` (dominant) + `recency` +
  `preference match`, cut to a generous top-k so a major story is never buried.

---

## Sources (6)

| Source           | Site-specific handling                                     |
| ---------------- | ---------------------------------------------------------- |
| TechCrunch       | drop the recurring "TechCrunch Mobility" newsletter column |
| Ars Technica     | section allowlist on URL path (fails closed)               |
| VentureBeat      | full-body snippet → truncate to first 2 sentences          |
| The Register     | section allowlist (shared scheme with Ars)                 |
| BleepingComputer | strip trailing `[...]` truncation marker                   |
| The Next Web     | full-body snippet → first 2 sentences                      |

Add a source in `app/lib/ingest-pipeline/sources.ts`. Each source declares an
optional `filter` (drop unwanted URLs) and `transformSnippet` (reshape the
snippet); the runner stays generic.

---

## Folder structure

```
app/lib/
  clients/            external service clients
    db.ts               Prisma singleton (pg adapter + Neon)
    groq.ts             LLM client (OpenAI SDK pointed at Groq)
  helpers/            shared, dependency-free utilities
    clean.ts            NewsItem type, cleanText, canonicalizeUrl, isJunkLink
    auth.ts             isAuthorized() — constant-time Bearer check (all routes)
    cleanup.ts          delete articles older than 2 weeks
    seed.ts             upsert the singleton User (recipient + preferences)
  ingest-pipeline/    Phase 1
    sources.ts          per-source config (6 sources) + allowlists
    fetch-feeds.ts      parallel runner, per-feed try/catch, 15s timeout
    categorize.ts       LLM categorization (batched, strict enum validation)
    embed.ts            Jina embeddings (batched, retry/backoff)
    ingest.ts           entrypoint: fetch → dedup → categorize+embed → upsert
  digest-pipeline/    Phase 2
    load.ts             load the week's rows + embeddings (raw SQL)
    cluster.ts          cosine-distance union-find clustering
    score.ts            score + top-k + loadPreferences()
    rank.ts             one LLM call: dedup-confirm
    render.ts           HTML email, grouped by category (timezone-aware)
    send.ts             send via Resend (recipient from DB)
    index.ts            orchestrator: runDigest()

app/api/               Bearer-secured POST route handlers (Node runtime)
  ingest/route.ts        → ingest()    (6h cron)
  cleanup/route.ts       → cleanup()   (weekly)
  mail/route.ts          → runDigest() (weekly)

.github/workflows/
  ingest.yml            manual dispatch; schedule commented out (see Schedulers)
  cleanup.yml           weekly Sun 03:00 UTC → /api/cleanup
  mail-send.yml         weekly Sun 04:00 UTC → /api/mail

prisma/
  schema.prisma         Article + User, CATEGORY enum, embedding vector(768)
  migrations/           init + pgvector embedding column
```

### Data model

- **Article:** `id`, `title`, `url` (unique), `description` (cleaned snippet),
  `source`, `published_at`, `category` (`CATEGORY[]`), `embedding`
  (`vector(768)`), `created_at`.
- **User** (singleton, self-hosted): `id`, `email` (unique), `preferences`
  (`CATEGORY[]`).
- **CATEGORY enum:** `ai, webdev, saas, hardware, software, llm, startup,
backend, security, cloud, mobile`.

---

## Setup

### 1. Accounts (all free tier)

| Service                               | Used for                       | Free tier                                |
| ------------------------------------- | ------------------------------ | ---------------------------------------- |
| [Neon](https://neon.tech)             | Postgres + pgvector            | always-free project                      |
| [Groq](https://console.groq.com/keys) | categorization + dedup LLM     | free                                     |
| [Jina](https://jina.ai/?sui=apikey)   | embeddings                     | 10M-token one-time grant (~12+ yrs here) |
| [Resend](https://resend.com/api-keys) | sending the email              | 100 emails/day (we send ~1/week)         |
| [Vercel](https://vercel.com)          | hosting the routes             | Hobby                                    |
| [EasyCron](https://www.easycron.com)  | 6h ingest trigger              | free                                     |
| GitHub Actions                        | weekly cleanup + mail triggers | free                                     |

### 2. Database + user

```bash
npm install                  # postinstall runs `prisma generate`
npx prisma migrate deploy    # apply schema incl. the pgvector column
```

Seed the singleton `User` row (the digest recipient + the categories to boost
in ranking) with `helpers/seed.ts`. It reads from env so no personal data lands
in the repo, and upserts by email (re-running just updates preferences):

```bash
1. SEED_EMAIL=you@example.com (env variable)

2. preferences=["ai","mobile"...] (in app/lib/helpers/seed.ts)

3. npx tsx app/lib/helpers/seed.ts

(SEED_EMAIL is not needed during deployment)
```

### 3. Environment variables

Set these in **`.env`** (local) **and** in **Vercel → Project → Settings →
Environment Variables** (the `.env` file is gitignored, so Vercel needs them set
manually):

| Variable         | Description                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | Neon Postgres connection string                                                                                                          |
| `GROQ_API_KEY`   | from console.groq.com/keys                                                                                                               |
| `GROQ_MODEL`     | default `llama-3.3-70b-versatile`                                                                                                        |
| `JINA_API_KEY`   | from jina.ai (10M-token grant)                                                                                                           |
| `CRON_SECRET`    | shared secret guarding all routes — `openssl rand -hex 32`                                                                               |
| `RESEND_API_KEY` | from resend.com/api-keys                                                                                                                 |
| `RESEND_FROM`    | verified sender, e.g. `Digest <digest@yourdomain.com>` (or `onboarding@resend.dev` for testing — delivers only to your own Resend email) |
| `MAIL_TZ`        | IANA timezone for the digest date, e.g. `Asia/Kolkata` (default `Asia/Kolkata`)                                                          |

### 4. Deploy + schedulers

Push to GitHub and import the repo into Vercel. The route handlers are
trigger-agnostic — they only check `Authorization: Bearer $CRON_SECRET` + POST —
so any scheduler works.

- **Ingest (every 6h) → EasyCron.** GitHub's free-tier cron is unreliable for a
  6h cadence (it drifts hours), so the `schedule:` in `ingest.yml` is commented
  out and EasyCron drives it instead:
    - URL `https://<app>.vercel.app/api/ingest`, method `POST`,
      header `Authorization: Bearer <CRON_SECRET>`, cron `0 */6 * * *`.
    - _(On a paid GitHub plan, scheduled runs are reliable — just uncomment the
      `schedule:` lines and skip EasyCron.)_
- **Cleanup + Mail (weekly) → GitHub Actions.** Cron drift is harmless for
  weekly jobs, so `cleanup.yml` (Sun 03:00 UTC) and `mail-send.yml` (Sun 04:00
  UTC) keep their `schedule:` enabled.

Trigger any workflow manually from **Actions → … → Run workflow**.

### 5. GitHub repo secrets

**Settings → Secrets and variables → Actions:**

| Secret        | Value                                                              |
| ------------- | ------------------------------------------------------------------ |
| `CRON_SECRET` | same value as the Vercel env var                                   |
| `INGEST_URL`  | `https://<app>.vercel.app/api/ingest` (for manual ingest dispatch) |
| `CLEANUP_URL` | `https://<app>.vercel.app/api/cleanup`                             |
| `MAIL_URL`    | `https://<app>.vercel.app/api/mail`                                |

> `CRON_SECRET` lives wherever the request is **sent** (EasyCron, GitHub
> secrets) and wherever it is **verified** (Vercel). If any scheduler is ever
> compromised, rotate it in all places.

---

## Local development

Production never runs the pipeline by hand — the Vercel routes + schedulers do.
`tsx` is only a development convenience for inspecting or manually firing a stage
locally (no build/compile step needed):

```bash
npx tsx app/lib/ingest-pipeline/ingest.ts   # run one ingest cycle
npx tsx app/lib/digest-pipeline/index.ts    # build + send the digest now
npx tsx app/lib/helpers/cleanup.ts          # delete articles > 2 weeks old
```

Prisma:

```bash
npx prisma migrate deploy    # apply pending migrations
npx prisma generate          # regenerate the client after schema changes
```

---

## Cost

Designed to sit at **~$0/month indefinitely** at this volume (~6 sources,
roughly a few hundred articles a week):

- **Neon** free project, **Vercel** Hobby, **EasyCron** free, **GitHub Actions**
  free — all within limits.
- **Groq** free tier covers the small batched classification + one weekly dedup
  call.
- **Jina** 10M-token grant lasts ~12+ years at ~15K tokens/week.
- **Resend** free tier is 100 emails/day; we send one per week.

---

## Key design decisions

- **Cheap/idempotent early, expensive/preference-dependent late** — the whole
  reason for the two-phase split.
- **Categorize at ingest, cluster + rank on Sunday** — category is permanent and
  user-independent; clustering + ranking need the whole week and current
  preferences at once.
- **Embeddings via a hosted API, not a local model** — a local ONNX model bloats
  the serverless bundle and pays a cold-start cost every invocation; Jina returns
  768-dim vectors in one HTTP call.
- **`llama-3.3-70b-versatile`, not `gpt-oss`** — the gpt-oss models are reasoning
  models whose channels collide with `response_format: json_object` (Groq returns
  `json_validate_failed`). A non-reasoning instruction model produces clean JSON.
- **Math ranking, LLM only for dedup-confirm** — coverage + recency + preference
  is explainable and deterministic; the LLM call is reserved for catching
  near-duplicates the tight embedding threshold missed (it returns indices only).
- **Constant-time Bearer auth on every route** (`crypto.timingSafeEqual`), Node
  runtime (Prisma/pg + crypto can't run on Edge), `force-dynamic` (never cached).
- **Bulk raw-SQL upsert** for the pgvector column (Prisma's `createMany` can't
  write `Unsupported("vector")`); each embedding is validated to 768 dims so one
  bad vector can't abort the whole batch.
