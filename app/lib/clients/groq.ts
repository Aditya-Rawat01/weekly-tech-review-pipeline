import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env["GROQ_API_KEY"];
if (!apiKey) {
  throw new Error("GROQ_API_KEY is not set");
}

export const MODEL = process.env["GROQ_MODEL"] ?? "llama-3.3-70b-versatile";

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

export type ChatOptions = {
  temperature?: number;
  /** Force JSON output when the model/endpoint supports it. */
  json?: boolean;
};

/**
 * Single-shot chat completion with retry/backoff for free-tier rate limits
 * (429) and transient 5xx. Returns the raw assistant text.
 */
export async function complete(
  system: string,
  user: string,
  opts: ChatOptions = {},
): Promise<string> {
  const { temperature = 0, json = false } = opts;
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: MODEL,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt === maxAttempts) throw err;
      // exponential backoff: 1s, 2s, 4s
      const waitMs = 1000 * 2 ** (attempt - 1);
      console.warn(
        `[groq] ${status} on attempt ${attempt}, retrying in ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error("unreachable");
}
