import { prisma } from "../clients/db";

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
