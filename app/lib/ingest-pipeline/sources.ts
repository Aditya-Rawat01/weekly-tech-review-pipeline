export type Source = {
    name: string;
    url: string;

    filter?: (link: string) => boolean;

    transformSnippet?: (cleaned: string) => string;
};

const techcrunch: Source = {
    name: "techcrunch",
    url: "https://techcrunch.com/feed/",
    filter: (link) => !/\/techcrunch-mobility-/.test(link),
};

const ARS_ALLOWED_SECTIONS = new Set([
    "ai",
    "security",
    "tech-policy",
    "gadgets",
    "google",
]);

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

function firstSentences(text: string, max = 2): string {
    const parts = text.split(/(?<=[.!?])\s+(?=["'“(]?[A-Z])/);
    return parts.slice(0, max).join(" ").trim();
}

const venturebeat: Source = {
    name: "venturebeat",
    url: "https://venturebeat.com/feed/",
    transformSnippet: (cleaned) => firstSentences(cleaned),
};

const bleepingcomputer: Source = {
    name: "bleepingcomputer",
    url: "https://www.bleepingcomputer.com/feed/",
    transformSnippet: (cleaned) =>
        cleaned.replace(/\s*\[\.\.\.\]\s*$/, "").trim(),
};

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
