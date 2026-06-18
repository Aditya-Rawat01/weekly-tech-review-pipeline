import type { ScoredCluster } from "./score";

/** Human labels for the CATEGORY enum (for section headers + tags). */
const CATEGORY_LABELS: Record<string, string> = {
    ai: "AI",
    webdev: "Web Dev",
    saas: "SaaS",
    hardware: "Hardware",
    software: "Software",
    llm: "LLM",
    startup: "Startups",
    backend: "Backend",
    security: "Security",
    cloud: "Cloud",
    mobile: "Mobile",
};

function label(cat: string): string {
    return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** The section a story is filed under: its first preferred category, else its
 *  first category, else "other". One story → one section (no duplication). */
function primaryCategory(s: ScoredCluster, prefs: Set<string>): string {
    return s.categories.find((c) => prefs.has(c)) ?? s.categories[0] ?? "other";
}

function sourcesLine(s: ScoredCluster): string {
    const sources = [...new Set(s.cluster.members.map((m) => m.source))];
    const covered = sources.map(escapeHtml).join(", ");
    // Count DISTINCT sources — a cluster can hold 2 articles from one outlet
    // (near-dup headlines), which isn't "2 sources".
    return sources.length > 1
        ? `Covered by ${covered} (${sources.length} sources)`
        : covered;
}

function renderStory(s: ScoredCluster): string {
    const r = s.cluster.representative;
    const tags = s.categories
        .map(
            (c) =>
                `<span style="display:inline-block;font-size:11px;color:#5b6470;background:#eef1f5;border-radius:4px;padding:2px 7px;margin:0 4px 0 0;">${escapeHtml(label(c))}</span>`,
        )
        .join("");

    return `
  <div style="padding:16px 0;border-bottom:1px solid #eceff3;">
    <a href="${escapeHtml(r.url)}" style="color:#111827;font-size:16px;font-weight:600;text-decoration:none;line-height:1.35;">${escapeHtml(r.title)}</a>
    <div style="color:#4b5563;font-size:14px;line-height:1.5;margin:6px 0 8px;">${escapeHtml(r.description)}</div>
    <div style="font-size:12px;color:#8a929c;">${tags}<span style="margin-left:${s.categories.length ? "4px" : "0"};">${sourcesLine(s)}</span></div>
  </div>`;
}

/**
 * Render the deduped, ranked shortlist into a subject + HTML email, grouped by
 * category. Sections are ordered by their best (highest-ranked) story; stories
 * within a section keep score order. Inline styles for email-client safety.
 */
export function renderDigest(
    shortlist: ScoredCluster[],
    prefs: Set<string>,
): { subject: string; html: string } {
    const timeZone = process.env.MAIL_TZ || "Asia/Kolkata";
    const dateStr = new Date().toLocaleDateString("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    // Bucket by primary category. Map insertion order = first appearance in the
    // (score-sorted) shortlist, so sections are ordered by their top story.
    const sections = new Map<string, ScoredCluster[]>();
    for (const s of shortlist) {
        const cat = primaryCategory(s, prefs);
        (sections.get(cat) ?? sections.set(cat, []).get(cat)!).push(s);
    }

    const body = [...sections.entries()]
        .map(
            ([cat, stories]) => `
    <h2 style="font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;margin:28px 0 4px;">${escapeHtml(label(cat))}</h2>
    ${stories.map(renderStory).join("")}`,
        )
        .join("");

    const subject = `Weekly Tech Digest — ${shortlist.length} ${shortlist.length === 1 ? "story" : "stories"} (${dateStr})`;

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f8fa;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#ffffff;">
    <div style="border-bottom:2px solid #111827;padding-bottom:12px;margin-bottom:8px;">
      <div style="font-size:22px;font-weight:700;color:#111827;">Weekly Tech Digest</div>
      <div style="font-size:13px;color:#8a929c;margin-top:2px;">${escapeHtml(dateStr)} · ${shortlist.length} ${shortlist.length === 1 ? "story" : "stories"}</div>
    </div>
    ${body}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eceff3;font-size:12px;color:#aab1ba;">
      Ranked by coverage across sources, recency, and your interests. Self-hosted, no tracking.
    </div>
  </div>
</body>
</html>`;

    return { subject, html };
}
