import { prisma } from "../db";

/** A week's article row, with its embedding parsed into a number[]. */
export type WeekRow = {
  id: string;
  title: string;
  url: string;
  description: string;
  source: string;
  published_at: Date;
  category: string[];
  embedding: number[];
};

type RawRow = Omit<WeekRow, "embedding" | "category"> & {
  embedding: string; // pgvector ::text → "[0.1,0.2,...]"
  category: string[];
};

/**
 * Load the trailing `days` of articles that HAVE an embedding (clustering
 * needs the vector). Raw SQL because Prisma can't read the Unsupported
 * ("vector") column — we cast it to text and JSON.parse it (pgvector's text
 * form is a valid JSON array). category is cast to text[] so the pg driver
 * hands back a clean JS string[].
 *
 * Window is by created_at (when WE ingested), not published_at — a story
 * published just before the window but ingested inside it should still count.
 */
export async function loadWeek(days = 7): Promise<WeekRow[]> {
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT id, title, url, description, source, published_at,
            category::text[] AS category,
            embedding::text   AS embedding
     FROM "Article"
     WHERE created_at >= now() - make_interval(days => $1)
       AND embedding IS NOT NULL
     ORDER BY published_at DESC`,
    days,
  );

  return rows.map((r) => ({
    ...r,
    embedding: JSON.parse(r.embedding) as number[],
  }));
}
