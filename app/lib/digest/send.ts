import { prisma } from "../db";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send the rendered digest to the singleton user (recipient read from the DB).
 * Uses Resend's REST API via fetch — no SDK dependency, same pattern as the
 * Jina client.
 *
 * Env:
 *  - RESEND_API_KEY — from https://resend.com/api-keys
 *  - RESEND_FROM    — a verified sender, e.g. "Digest <digest@yourdomain.com>".
 *                     "onboarding@resend.dev" works without domain setup but
 *                     only delivers to your own Resend account email.
 */
export async function sendDigest(
  subject: string,
  html: string,
): Promise<{ to: string; id: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM"];
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!from) throw new Error("RESEND_FROM is not set");

  const user = await prisma.user.findFirst({ select: { email: true } });
  if (!user?.email) {
    throw new Error("no user/email in DB — nobody to send the digest to");
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: user.email, subject, html }),
  });

  if (!res.ok) {
    throw new Error(`[send] Resend ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { id: string };
  return { to: user.email, id: json.id };
}
