import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"writing">;

// Published posts, newest first. Drafts never reach pages, the feed or the sitemap.
export const publishedPosts = async (): Promise<Post[]> =>
  (await getCollection("writing", (p) => !p.data.draft)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

export const formatDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
