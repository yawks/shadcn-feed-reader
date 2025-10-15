import { FeedItem } from '@/backends/types';

export type GroupedFeedItem = {
  isGroup: true;
  id: string;
  title: string;
  mainArticle: FeedItem;
  articles: FeedItem[];
  sources: { faviconUrl: string | undefined; title: string | undefined }[];
};

export type ProcessedFeedItem = FeedItem | GroupedFeedItem;

// 1. Keyword Extraction
export function extractKeywords(title: string): string[] {
  const words = title.split(' ');
  // Filter for capitalized words that are not at the start of the sentence
  // and are longer than 2 characters.
  return words.filter(word =>
    word.length > 2 &&
    word[0] === word[0].toUpperCase() &&
    words.indexOf(word) > 0
  );
}

// 2. Jaccard Similarity Calculation
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// 3. Main Grouping Function
export function groupArticles(articles: FeedItem[], similarityThreshold = 0.4): ProcessedFeedItem[] {

  // Remove duplicate articles by URL (keep the first occurrence)
  const seenUrls = new Set<string>();
  const uniqueArticles = articles.filter(article => {
    if (!article.url) return true;
    if (seenUrls.has(article.url)) return false;
    seenUrls.add(article.url);
    return true;
  });

  const articlesByKeyword: { [keyword: string]: FeedItem[] } = {};

  // First pass: group by shared keywords
  articles.forEach(article => {
    const keywords = extractKeywords(article.title);
    keywords.forEach(keyword => {
      if (!articlesByKeyword[keyword]) {
        articlesByKeyword[keyword] = [];
      }
      articlesByKeyword[keyword].push(article);
    });
  });

  const potentialGroups: FeedItem[][] = Object.values(articlesByKeyword)
    .filter(group => group.length > 1);

  const finalGroups: GroupedFeedItem[] = [];
  const processedArticleIds = new Set<number>();

  // Second pass: refine groups with Jaccard similarity and create final groups
  potentialGroups.forEach(group => {
    if (group.some(article => processedArticleIds.has(article.id))) {
      return; // Skip if any article in the group has already been processed
    }

    const mainArticle = group[0];
    const mainArticleTitleWords = new Set(mainArticle.title.toLowerCase().split(' '));

    const similarArticles = group.filter(article => {
      if (article.id === mainArticle.id) return true;
      const otherArticleTitleWords = new Set(article.title.toLowerCase().split(' '));
      const similarity = jaccardSimilarity(mainArticleTitleWords, otherArticleTitleWords);
      return similarity >= similarityThreshold;
    });

    if (similarArticles.length > 1) {
      similarArticles.forEach(article => processedArticleIds.add(article.id));

      const groupTitle = `Actualité : ${mainArticle.title}`;
      const sources = similarArticles.map(a => ({
        faviconUrl: a.feed?.faviconUrl,
        title: a.feed?.title
      }));

      finalGroups.push({
        isGroup: true,
        id: `group-${mainArticle.id}`,
        title: groupTitle,
        mainArticle: mainArticle,
        articles: similarArticles.slice(1),
        sources: sources,
      });
    }
  });

  // Filter out processed articles and combine with groups
  const ungroupedArticles = articles.filter(article => !processedArticleIds.has(article.id));

  return [...finalGroups, ...ungroupedArticles];
}

export function isGroupedFeedItem(item: ProcessedFeedItem): item is GroupedFeedItem {
  return 'isGroup' in item && item.isGroup;
}
