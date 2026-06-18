import "dotenv/config";
import { prisma } from "../clients/db";
import { CATEGORY } from "../../generated/prisma/enums";

const VALID = new Set<string>(Object.values(CATEGORY) as string[]);

/**
 * Seed (or update) the singleton User row — the digest recipient and the
 * categories to boost in ranking.
 *
 * Reads from env so no personal data lives in the (public) repo:
 *   SEED_EMAIL       = you@example.com            (required)
 *
 * Idempotent: upserts by email, so re-running just updates the preferences.
 */
export async function seedUser(): Promise<{
    email: string;
    preferences: CATEGORY[];
}> {
    const email = process.env["SEED_EMAIL"]?.trim();
    if (!email) throw new Error("SEED_EMAIL is not set");

    // change your preferences according to CATEGORY type
    // if your preferences is not in the CATEGORY type, then just update the enum CATEGORY, 
    // apply migrations and generate prisma client.
    const preferences: CATEGORY[] = [
        "ai",
        "webdev",
        "saas",
        "hardware",
        "software",
        "llm",
        "startup",
        "backend",
        "security",
        "cloud",
        "mobile",
    ];

    const user = await prisma.user.upsert({
        where: { email },
        update: { preferences },
        create: { email, preferences },
    });
    return { email: user.email, preferences: user.preferences };
}

// Allow running directly: `npx tsx app/lib/helpers/seed.ts`
if (process.argv[1]?.endsWith("seed.ts")) {
    seedUser()
        .then(({ email, preferences }) =>
            console.log(
                `[seed] user ${email} ← preferences [${preferences.join(", ")}]`,
            ),
        )
        .catch((err) => {
            console.error("[seed] failed:", err);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
