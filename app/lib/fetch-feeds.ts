import Parser from "rss-parser";
import { Agent } from "https";
import { cleanText, isJunkLink, type NewsItem } from "./clean";
import { SOURCES, type Source } from "./sources";

const parser = new Parser({
  requestOptions: { agent: new Agent({ keepAlive: false }) },
});

async function fetchSource(source: Source): Promise<NewsItem[]> {
  const { items } = await parser.parseURL(source.url);

  return items
    .filter((item) => !isJunkLink(item.link))
    .filter((item) => (source.filter ? source.filter(item.link!) : true))
    .map((item) => {
      const snippet = cleanText(item.contentSnippet);
      return {
        link: item.link!,
        title: cleanText(item.title),
        contentSnippet: source.transformSnippet
          ? source.transformSnippet(snippet)
          : snippet,
        pubDate: item.isoDate,
        source: source.name,
      };
    });
}

export async function fetchAllFeeds(): Promise<NewsItem[]> {
  const results = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        return await fetchSource(source);
      } catch (err) {
        console.error(`[feed] ${source.name} failed:`, (err as Error).message);
        return [] as NewsItem[];
      }
    }),
  );
  return results.flat();
}
