// Update this to your repository URL.
const REPO_URL =
    "https://github.com/Aditya-Rawat01/weekly-tech-review-pipeline";

const phases = [
    {
        n: "I",
        cadence: "Every 6 hours",
        title: "The wire comes in",
        flow: "fetch RSS → clean → dedup → categorize + embed → store",
        blurb: "Cheap, idempotent, incremental. A missed run self-heals on the next cycle, and only brand-new stories ever cost an LLM or embedding call.",
    },
    {
        n: "II",
        cadence: "Every Sunday",
        title: "The edition goes out",
        flow: "cluster → score → dedup-confirm → render → send",
        blurb: "Embeddings cluster the whole week to find what multiple outlets covered. Pure-math ranking surfaces it. One LLM pass removes leftover duplicates — it never rewrites a headline.",
    },
];

const stack = [
    "Next.js",
    "Neon · pgvector",
    "Prisma",
    "Groq",
    "Jina",
    "Resend",
    "Vercel",
    "EasyCron",
    "GitHub Actions",
];

const principles = [
    {
        title: "You own the front page",
        body: "Your sources, your filters, your preferences. No third-party curation, no engagement algorithm, just coverage, recency, and the topics you chose.",
    },
    {
        title: "Printed for ~$0",
        body: "Set in the free tiers of Neon, Groq, Jina, Resend, Vercel, and GitHub Actions. Designed to run indefinitely at near-zero cost.",
    },
    {
        title: "No tracking, no ads",
        body: "Self-hosted end to end. Nothing phones home, nothing is sold. One clean email a week and that is the whole paper.",
    },
];

// Sample stories for the "edition" clipping (mirrors the real digest output).
const edition = [
    {
        cat: "Artificial Intelligence",
        title: "Android 17 launches with Gemini multitasking",
        src: "TechCrunch, Ars Technica & The Next Web — 3 sources",
    },
    {
        cat: "Security",
        title: "Critical Fortinet FortiSandbox flaws exploited in the wild",
        src: "BleepingComputer & The Register — 2 sources",
    },
    {
        cat: "Startups",
        title: "SpaceX passes Amazon as valuation hits $2.7T",
        src: "TechCrunch",
    },
];

function GitHubMark() {
    return (
        <svg
            viewBox="0 0 16 16"
            width="15"
            height="15"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}

// Centered section heading with flanking rules, newspaper-style.
function Rubric({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-center gap-4">
            <span className="h-px flex-1 bg-stone-300 dark:bg-stone-700" />
            <h2 className="text-center text-xs font-bold uppercase tracking-[0.3em] text-stone-700 dark:text-stone-300">
                {children}
            </h2>
            <span className="h-px flex-1 bg-stone-300 dark:bg-stone-700" />
        </div>
    );
}

export default function Home() {
    return (
        <main className="flex-1 bg-stone-50 font-serif text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <div className="mx-auto w-full max-w-5xl px-6">
                {/* Top dateline bar */}
                <div className="flex items-center justify-between border-b border-stone-300 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-500 dark:border-stone-700">
                    <span>Self-Hosted Edition</span>
                    <span className="hidden sm:inline">
                        Published every Sunday
                    </span>
                    <span>No. 1</span>
                </div>

                {/* Masthead */}
                <header className="border-b-4 border-double border-stone-900 pb-5 pt-8 text-center dark:border-stone-100">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.35em] text-[#8a3324] dark:text-red-400">
                        Vol. I · Tech &amp; Technology
                    </p>
                    <h1 className="text-5xl font-bold leading-none tracking-tight sm:text-7xl">
                        The Weekly Tech Digest
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-lg italic leading-relaxed text-stone-600 dark:text-stone-400 sm:text-xl">
                        All the week&rsquo;s technology news:  clustered,
                        de-duplicated, ranked, and delivered to your inbox every
                        Sunday.
                    </p>
                </header>

                {/* Sub-dateline */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-stone-300 py-2 text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:border-stone-700">
                    <span>Est. 2026</span>
                    <span className="text-stone-300 dark:text-stone-700">
                        ✦
                    </span>
                    <span>Near-Zero Cost</span>
                    <span className="text-stone-300 dark:text-stone-700">
                        ✦
                    </span>
                    <span>Open Source</span>
                    <span className="text-stone-300 dark:text-stone-700">
                        ✦
                    </span>
                    <span>No Tracking</span>
                </div>

                {/* Lead + edition clipping */}
                <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
                    <article>
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#8a3324] dark:text-red-400">
                            From the front page
                        </p>
                        <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                            Your week in tech, distilled to a single email.
                        </h2>
                        <p className="mt-5 text-lg leading-relaxed text-stone-700 first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-6xl first-letter:font-bold first-letter:leading-[0.8] dark:text-stone-300 sm:text-xl">
                            A self-hosted pipeline ingests tech news from a
                            handful of trusted feeds every six hours, all week
                            long. Come Sunday, it clusters the stories, ranks
                            them by how widely they were covered and how well
                            they match your interests, and mails you one clean,
                            de-duplicated edition grouped by section, with no
                            tracking and no ads.
                        </p>
                        <div className="mt-7">
                            <a
                                href={REPO_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 border border-stone-900 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.2em] transition-colors hover:bg-stone-900 hover:text-stone-50 dark:border-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
                            >
                                <GitHubMark />
                                Read the source
                            </a>
                        </div>
                    </article>

                    {/* Edition clipping */}
                    <aside className="border border-stone-900 dark:border-stone-100">
                        <div className="border-b border-stone-900 px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[0.25em] dark:border-stone-100">
                            This Week&rsquo;s Edition
                        </div>
                        <div className="divide-y divide-stone-200 dark:divide-stone-800">
                            {edition.map((s) => (
                                <div key={s.title} className="px-4 py-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a3324] dark:text-red-400">
                                        {s.cat}
                                    </div>
                                    <div className="mt-1 text-lg font-bold leading-snug">
                                        {s.title}
                                    </div>
                                    <div className="mt-1 text-sm italic text-stone-500">
                                        {s.src}
                                    </div>
                                </div>
                            ))}
                            <div className="px-4 py-2.5 text-center text-xs italic text-stone-400">
                                continued inside — 17 more stories
                            </div>
                        </div>
                    </aside>
                </section>

                {/* How it works */}
                <section className="border-t border-stone-300 py-12 dark:border-stone-700">
                    <Rubric>How the paper is made</Rubric>
                    <div className="mt-10 divide-y divide-stone-300 dark:divide-stone-700">
                        {phases.map((p) => (
                            <article
                                key={p.n}
                                className="flex flex-col gap-4 py-7 first:pt-0 sm:flex-row sm:gap-8"
                            >
                                <div className="font-serif text-5xl font-bold leading-none text-stone-300 dark:text-stone-700">
                                    {p.n}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a3324] dark:text-red-400">
                                        {p.cadence}
                                    </p>
                                    <h3 className="mt-1 text-2xl font-bold tracking-tight">
                                        {p.title}
                                    </h3>
                                    <code className="mt-3 block overflow-x-auto border-l-2 border-stone-300 bg-stone-100 px-3 py-2 font-mono text-[13px] text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                                        {p.flow}
                                    </code>
                                    <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-700 dark:text-stone-300">
                                        {p.blurb}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Principles — newspaper columns */}
                <section className="border-t border-stone-300 py-12 dark:border-stone-700">
                    <Rubric>Why this paper is different</Rubric>
                    <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-stone-300 sm:dark:divide-stone-700">
                        {principles.map((p) => (
                            <div
                                key={p.title}
                                className="sm:px-6 sm:first:pl-0 sm:last:pr-0"
                            >
                                <h3 className="text-lg font-bold leading-snug tracking-tight">
                                    {p.title}
                                </h3>
                                <p className="mt-2 text-lg leading-relaxed text-stone-700 dark:text-stone-300">
                                    {p.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Colophon */}
                <section className="border-t border-stone-300 py-12 dark:border-stone-700">
                    <Rubric>Colophon</Rubric>
                    <p className="mx-auto mt-8 max-w-3xl text-center text-lg leading-loose text-stone-600 dark:text-stone-400">
                        Set in Georgia.&nbsp;
                        <br />
                        {stack.map((s, i) => (
                            <span key={s}>
                                <span className="font-mono text-[13px] text-stone-800 dark:text-stone-200">
                                    {s}
                                </span>
                                {i < stack.length - 1 ? (
                                    <span className="px-1.5 text-stone-400">
                                        ·
                                    </span>
                                ) : (
                                    "."
                                )}
                            </span>
                        ))}
                    </p>
                </section>

                {/* Footer */}
                <footer className="flex flex-col items-center justify-between gap-3 border-t-4 border-double border-stone-900 py-8 text-[11px] uppercase tracking-[0.2em] text-stone-500 sm:flex-row dark:border-stone-100">
                    <span>Self-Hosted · No Tracking · No Ads</span>
                    <a
                        href={REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 transition-colors hover:text-stone-900 dark:hover:text-stone-100"
                    >
                        <GitHubMark />
                        Source
                    </a>
                </footer>
            </div>
        </main>
    );
}
