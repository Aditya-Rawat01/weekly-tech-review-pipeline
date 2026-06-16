import { prisma } from "./db";

/**
 * Delete articles older than 2 weeks (based on published_at).
 * Keeps the DB lean — the digest only needs the current week anyway.
 */
export async function cleanup(): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.article.deleteMany({
    where: { published_at: { lt: cutoff } },
  });
  return count;
}

// Allow running directly: `npx tsx app/lib/cleanup.ts`
if (process.argv[1]?.endsWith("cleanup.ts")) {
  cleanup()
    .then((count) => console.log(`[cleanup] deleted ${count} articles older than 2 weeks`))
    .catch((err) => {
      console.error("[cleanup] failed:", err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
