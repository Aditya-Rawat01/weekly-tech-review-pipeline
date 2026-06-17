import { cleanText, isJunkLink } from "./clean";

export type Source = {
  name: string;
  url: string;

  filter?: (link: string) => boolean;

  transformSnippet?: (cleaned: string) => string;
};

// --- TechCrunch -------------------------------------------------------------
// Clean one-liner snippets out of the box. One exception: the recurring
// "TechCrunch Mobility" newsletter column carries boilerplate intro text
// ("Welcome back to TechCrunch Mobility...") instead of a real story snippet,
// so drop it via its URL slug.
const techcrunch: Source = {
  name: "techcrunch",
  url: "https://techcrunch.com/feed/",
  filter: (link) => !/\/techcrunch-mobility-/.test(link),
};

// --- Ars Technica -----------------------------------------------------------
// Snippets are clean but the feed is broad. Ars encodes the section as the
// first path segment (arstechnica.com/ai/... -> "ai"). Allowlist (fails
// closed) so culture/science/health/cars/space are dropped by default.
const ARS_ALLOWED_SECTIONS = new Set([
  "ai",
  "security",
  "tech-policy",
  "gadgets",
  "google",
]);

// Both Ars and The Register encode the section as the first path segment of
// the URL (arstechnica.com/ai/... -> "ai"; theregister.com/security/... ->
// "security"). Shared helper; each source keeps its own allowlist.
function firstPathSegment(link: string): string | null {
  try {
    return new URL(link).pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

const arstechnica: Source = {
  name: "arstechnica",
  url: "https://feeds.arstechnica.com/arstechnica/index",
  filter: (link) => {
    const section = firstPathSegment(link);
    return section !== null && ARS_ALLOWED_SECTIONS.has(section);
  },
};

// --- The Register -----------------------------------------------------------
// Clean one-liner snippets, but a broad enterprise-tech feed. Same
// section-as-first-path-segment scheme as Ars. Allowlist (fails closed) keeps
// the security/software/infra sections and drops science/hpc/public-sector/
// offbeat. Unknown slugs simply never match, so over-listing is harmless.
const REGISTER_ALLOWED_SECTIONS = new Set([
  "security",
  "cyber-crime",
  "software",
  "systems",
  "networks",
  "databases",
  "ai-and-ml",
  "os-platforms",
  "cloud",
  "devops",
  "storage",
  "virtualization",
  "personal-tech",
]);

const theregister: Source = {
  name: "theregister",
  url: "https://www.theregister.com/headlines.atom",
  filter: (link) => {
    const section = firstPathSegment(link);
    return section !== null && REGISTER_ALLOWED_SECTIONS.has(section);
  },
};

// --- VentureBeat ------------------------------------------------------------
// VentureBeat ships the FULL article body in contentSnippet. Keep only the
// first couple of sentences. Split on sentence-ending punctuation followed by
// whitespace + a capital/quote, so version numbers (K2.7), decimals ($1.1) and
// ".md" are not treated as boundaries.
function firstSentences(text: string, max = 2): string {
  const parts = text.split(/(?<=[.!?])\s+(?=["'“(]?[A-Z])/);
  return parts.slice(0, max).join(" ").trim();
}

const venturebeat: Source = {
  name: "venturebeat",
  url: "https://venturebeat.com/feed/",
  transformSnippet: (cleaned) => firstSentences(cleaned),
};

// --- BleepingComputer -------------------------------------------------------
// Clean, tight security snippets out of the box. Only quirk: a trailing
// "[...]" truncation marker that cleanText's ellipsis trim doesn't catch (it's
// ASCII dots, not the … char), so strip it here.
const bleepingcomputer: Source = {
  name: "bleepingcomputer",
  url: "https://www.bleepingcomputer.com/feed/",
  transformSnippet: (cleaned) => cleaned.replace(/\s*\[\.\.\.\]\s*$/, "").trim(),
};

// --- The Next Web -----------------------------------------------------------
// Ships the full article body in contentSnippet (like VentureBeat) -> reuse the
// same first-two-sentences truncation.
const thenextweb: Source = {
  name: "thenextweb",
  url: "https://thenextweb.com/feed",
  transformSnippet: (cleaned) => firstSentences(cleaned),
};

export const SOURCES: Source[] = [
  techcrunch,
  arstechnica,
  venturebeat,
  theregister,
  bleepingcomputer,
  thenextweb,
];

export {
  firstSentences,
  ARS_ALLOWED_SECTIONS,
  REGISTER_ALLOWED_SECTIONS,
  firstPathSegment,
  firstPathSegment as arsSection,
};
