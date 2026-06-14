import { cleanText, isJunkLink } from "./clean";

export type Source = {
  name: string;
  url: string;

  filter?: (link: string) => boolean;

  transformSnippet?: (cleaned: string) => string;
};

// --- TechCrunch -------------------------------------------------------------
// Clean one-liner snippets out of the box. No site-specific config needed.
const techcrunch: Source = {
  name: "techcrunch",
  url: "https://techcrunch.com/feed/",
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

function arsSection(link: string): string | null {
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
    const section = arsSection(link);
    return section !== null && ARS_ALLOWED_SECTIONS.has(section);
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

export const SOURCES: Source[] = [techcrunch, arstechnica, venturebeat];

export { firstSentences, ARS_ALLOWED_SECTIONS, arsSection };
