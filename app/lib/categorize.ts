import { complete } from "./groq";
import { CATEGORY } from "../generated/prisma/enums";

/** Valid labels, derived from the Prisma enum so the two never drift. */
const CATEGORIES = Object.values(CATEGORY) as CATEGORY[];
const CATEGORY_SET = new Set<string>(CATEGORIES);

export type Categorizable = {
  title: string;
  description: string;
};

const SYSTEM_PROMPT = `You are a strict tech-news classifier. You assign category labels to news items.

ALLOWED CATEGORIES (use these EXACT lowercase strings, nothing else):
${CATEGORIES.join(", ")}

RULES:
- Choose every category that genuinely applies to an item. An item usually has 1-3 categories.
- Assign a category ONLY if the item is truly ABOUT that area — not because of a loosely related keyword. (e.g. a story about social-media regulation or online-safety law is NOT "webdev"; a policy/business/society story merely set in tech is often none of these.)
- "categories" MUST always be a JSON array, even when there is only one label.
- Use ONLY strings from the allowed list above. Never invent, translate, pluralize, or capitalize labels.
- Prefer an empty array [] over forcing a weak or tangential match. If no category genuinely fits, return [].
- Do NOT explain, summarize, or add any text outside the JSON.
- Base the decision ONLY on the provided title and description. Do not use outside knowledge.

OUTPUT FORMAT (JSON object only):
{"results":[{"index":0,"categories":["ai","llm"]},{"index":1,"categories":["security"]}]}

The "index" MUST match the item's index from the input. Return one result object per input item, in order.`;

/** Build the user message: a compact numbered list of items. */
function buildUserMessage(items: Categorizable[]): string {
  const lines = items.map(
    (it, i) =>
      `${i}. TITLE: ${it.title}\n   DESCRIPTION: ${it.description || "(none)"}`,
  );
  return `Classify these ${items.length} items:\n\n${lines.join("\n\n")}`;
}

/** Keep only valid enum labels; dedup; preserve nothing invalid. */
function sanitize(raw: unknown): CATEGORY[] {
  if (!Array.isArray(raw)) return [];
  const out: CATEGORY[] = [];
  for (const v of raw) {
    if (typeof v === "string") {
      const label = v.trim().toLowerCase();
      if (CATEGORY_SET.has(label) && !out.includes(label as CATEGORY)) {
        out.push(label as CATEGORY);
      }
    }
  }
  return out;
}

type RawResult = { index?: number; categories?: unknown };

export async function categorizeBatch(
  items: Categorizable[],
): Promise<CATEGORY[][]> {
  if (items.length === 0) return [];

  // default every item to [] so length always matches input
  const result: CATEGORY[][] = items.map(() => []);

  // The LLM call can throw on non-retryable errors (e.g. Groq's
  // json_validate_failed on reasoning models). Degrade gracefully to empty
  // categories for this batch rather than crashing the whole ingest — the
  // articles still get stored + embedded, just uncategorized.
  let content: string;
  try {
    content = await complete(SYSTEM_PROMPT, buildUserMessage(items), {
      temperature: 0,
      json: true,
    });
  } catch (err) {
    console.warn(
      "[categorize] LLM call failed, defaulting batch to []:",
      (err as Error).message,
    );
    return result;
  }

  let parsed: { results?: RawResult[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    console.warn("[categorize] non-JSON response, defaulting batch to []");
    return result;
  }

  for (const r of parsed.results ?? []) {
    if (typeof r.index === "number" && r.index >= 0 && r.index < items.length) {
      result[r.index] = sanitize(r.categories);
    }
  }
  return result;
}

// batching 15 items at a time
export async function categorizeAll(
  items: Categorizable[],
  batchSize = 15,
): Promise<CATEGORY[][]> {
  const out: CATEGORY[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    out.push(...(await categorizeBatch(batch)));
  }
  return out;
}
