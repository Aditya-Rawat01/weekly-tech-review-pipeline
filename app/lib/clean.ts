import { decode } from "he";

export type NewsItem = {
  link: string;
  title: string;
  contentSnippet: string;
  pubDate: string | undefined;
  source: string;
};

export function cleanText(raw = ""): string {
  return decode(raw.replace(/<[^>]*>/g, ""))
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\[?…\]?\s*$/, "")
    .trim();
}

export function canonicalizeUrl(link: string): string {
  try {
    const u = new URL(link);
    u.search = "";
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return link;
  }
}

export function isJunkLink(link: string | undefined): boolean {
  if (!link) return true;
  return /\/video\/|post_type=/.test(link);
}
