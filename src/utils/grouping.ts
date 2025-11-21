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

// Helper function to normalize words (remove punctuation, accents, etc.)
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove accents
}

// 1. Keyword Extraction - Extract all proper nouns (capitalized words)
export function extractKeywords(title: string): string[] {
  if (!title) return [];
  const words = title.split(/\s+/);
  const properNouns: string[] = [];
  
  words.forEach(word => {
    // Remove punctuation from word for checking
    const cleanWord = word.replace(/[^\w]/g, '');
    // Check if word is capitalized and longer than 2 characters
    if (cleanWord.length > 2 && cleanWord[0] === cleanWord[0].toUpperCase()) {
      // Normalize the word for comparison
      const normalized = normalizeWord(cleanWord);
      if (normalized.length > 0) {
        properNouns.push(normalized);
      }
    }
  });
  
  return [...new Set(properNouns)]; // Remove duplicates
}

// Extract all words (for general similarity calculation)
function extractAllWords(title: string): string[] {
  if (!title) return [];
  return title
    .split(/\s+/)
    .map(word => normalizeWord(word))
    .filter(word => word.length > 0);
}

// 2. Jaccard Similarity Calculation
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// 3. Enhanced Similarity Calculation that gives more weight to proper nouns
function enhancedSimilarity(
  titleA: string,
  titleB: string,
  properNounsA: Set<string>,
  properNounsB: Set<string>
): number {
  // Extract all words for general similarity
  const allWordsA = new Set(extractAllWords(titleA));
  const allWordsB = new Set(extractAllWords(titleB));
  
  // Calculate general Jaccard similarity
  const generalSimilarity = jaccardSimilarity(allWordsA, allWordsB);
  
  // Calculate proper nouns similarity
  const properNounsSimilarity = jaccardSimilarity(properNounsA, properNounsB);
  
  // Find common and unique proper nouns
  const commonProperNouns = new Set([...properNounsA].filter(x => properNounsB.has(x)));
  const uniqueProperNounsA = new Set([...properNounsA].filter(x => !properNounsB.has(x)));
  const uniqueProperNounsB = new Set([...properNounsB].filter(x => !properNounsA.has(x)));
  const totalUniqueProperNouns = uniqueProperNounsA.size + uniqueProperNounsB.size;
  
  // If articles share proper nouns but have many unique ones, they're likely about different topics
  // Penalize cases where there are more unique proper nouns than common ones
  let diversityPenalty = 1.0;
  if (commonProperNouns.size > 0 && totalUniqueProperNouns > commonProperNouns.size * 2) {
    // If there are 2x more unique proper nouns than common ones, apply a penalty
    diversityPenalty = 0.7;
  }
  if (commonProperNouns.size > 0 && totalUniqueProperNouns > commonProperNouns.size * 3) {
    // If there are 3x more unique proper nouns, apply a stronger penalty
    diversityPenalty = 0.5;
  }
  
  // Weighted combination: proper nouns count for 50%, general similarity for 50%
  // But require a minimum general similarity to avoid grouping articles with different topics
  let finalSimilarity = generalSimilarity * 0.5 + properNounsSimilarity * 0.5;
  
  // Apply diversity penalty
  finalSimilarity *= diversityPenalty;
  
  // Require minimum general similarity (at least 0.25) to avoid grouping articles with completely different topics
  // even if they share some proper nouns
  if (generalSimilarity < 0.25) {
    finalSimilarity = Math.min(finalSimilarity, generalSimilarity * 1.2); // Cap at slightly above general similarity
  }
  
  // Additional boost if there are multiple common proper nouns AND good general similarity
  if (commonProperNouns.size >= 2 && generalSimilarity >= 0.3) {
    finalSimilarity = Math.max(finalSimilarity, 0.45);
  }
  
  return finalSimilarity;
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

  // First pass: group by shared keywords (use uniqueArticles)
  uniqueArticles.forEach(article => {
    const keywords = extractKeywords(article.title);
    keywords.forEach(keyword => {
      if (!articlesByKeyword[keyword]) {
        articlesByKeyword[keyword] = [];
      }
      articlesByKeyword[keyword].push(article);
    });
  });

  // Get potential groups from shared keywords
  // Articles that share at least one proper noun will be in the same potential group
  const potentialGroups: FeedItem[][] = Object.values(articlesByKeyword)
    .filter(group => group.length > 1);

  const finalGroups: GroupedFeedItem[] = [];
  const processedArticleIds = new Set<number>();

  // Second pass: refine groups with enhanced similarity and create final groups
  potentialGroups.forEach(group => {
    if (group.some(article => processedArticleIds.has(article.id))) {
      return; // Skip if any article in the group has already been processed
    }

    // Choisir comme mainArticle celui qui a une miniature si possible
    const mainArticle = group.find(a => a.thumbnailUrl && a.thumbnailUrl.trim() !== '') || group[0];
    if (!mainArticle?.title) return;
    
    const mainArticleProperNouns = new Set(extractKeywords(mainArticle.title));

    const similarArticles = group.filter(article => {
      if (article.id === mainArticle.id) return true;
      if (!article?.title) return false;
      
      const articleProperNouns = new Set(extractKeywords(article.title));
      const similarity = enhancedSimilarity(
        mainArticle.title,
        article.title,
        mainArticleProperNouns,
        articleProperNouns
      );
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

  // Filter out processed articles and combine with groups (use uniqueArticles)
  const ungroupedArticles = uniqueArticles.filter(article => !processedArticleIds.has(article.id));

  return [...finalGroups, ...ungroupedArticles];
}

export function isGroupedFeedItem(item: ProcessedFeedItem): item is GroupedFeedItem {
  return 'isGroup' in item && item.isGroup;
}
