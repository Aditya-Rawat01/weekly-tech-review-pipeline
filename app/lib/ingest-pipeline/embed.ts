import "dotenv/config";

const apiKey = process.env["JINA_API_KEY"];
if (!apiKey) throw new Error("JINA_API_KEY is not set");

const ENDPOINT = "https://api.jina.ai/v1/embeddings";
const MODEL = "jina-embeddings-v2-base-en";

/**
 * Embed an array of texts via Jina Embeddings API.
 * Returns one 768-dim vector per input text, in order.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      // Sort by index to guarantee input order
      return json.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`[embed] Jina API ${res.status}: ${await res.text()}`);
    }
    const waitMs = 1000 * 2 ** (attempt - 1);
    console.warn(`[embed] ${res.status} on attempt ${attempt}, retrying in ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error("unreachable");
}

/**
 * Embed articles (title + description concatenated).
 * Batches to stay within Jina's per-request limits.
 */
export async function embedArticles(
  articles: { title: string; description: string }[],
  batchSize = 64,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const texts = batch.map((a) => `${a.title}. ${a.description}`);
    vectors.push(...(await embedTexts(texts)));
  }
  return vectors;
}
