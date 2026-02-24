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

// 3. Main Grouping Function - uses union-find for correct transitive grouping
export function groupArticles(articles: FeedItem[], similarityThreshold = 0.4): ProcessedFeedItem[] {

  // Remove duplicate articles by URL (keep the first occurrence)
  const seenUrls = new Set<string>();
  const uniqueArticles = articles.filter(article => {
    if (!article.url) return true;
    if (seenUrls.has(article.url)) return false;
    seenUrls.add(article.url);
    return true;
  });

  if (uniqueArticles.length === 0) return [];

  // Pre-compute keywords for each article to avoid redundant extraction
  const articleKeywordsMap = new Map<number, Set<string>>();
  uniqueArticles.forEach(article => {
    articleKeywordsMap.set(article.id, new Set(extractKeywords(article.title)));
  });

  // Index articles by keyword to generate candidate pairs efficiently
  const articlesByKeyword = new Map<string, FeedItem[]>();
  uniqueArticles.forEach(article => {
    articleKeywordsMap.get(article.id)!.forEach(keyword => {
      if (!articlesByKeyword.has(keyword)) articlesByKeyword.set(keyword, []);
      articlesByKeyword.get(keyword)!.push(article);
    });
  });

  // Union-Find: allows correct transitive grouping (A~B and B~C → A,B,C grouped)
  const parent = new Map<number, number>();
  function find(id: number): number {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  }
  function union(id1: number, id2: number) {
    parent.set(find(id1), find(id2));
  }

  // Compare all pairs within each keyword bucket and union similar ones
  const comparedPairs = new Set<string>();
  articlesByKeyword.forEach(group => {
    if (group.length <= 1) return;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const artA = group[i];
        const artB = group[j];
        if (!artA.title || !artB.title) continue;

        const pairKey = artA.id < artB.id ? `${artA.id}-${artB.id}` : `${artB.id}-${artA.id}`;
        if (comparedPairs.has(pairKey)) continue;
        comparedPairs.add(pairKey);

        if (find(artA.id) === find(artB.id)) continue; // already in the same group

        const similarity = enhancedSimilarity(
          artA.title,
          artB.title,
          articleKeywordsMap.get(artA.id)!,
          articleKeywordsMap.get(artB.id)!
        );
        if (similarity >= similarityThreshold) {
          union(artA.id, artB.id);
        }
      }
    }
  });

  // Build final groups from union-find connected components
  const componentMap = new Map<number, FeedItem[]>();
  uniqueArticles.forEach(article => {
    const root = find(article.id);
    if (!componentMap.has(root)) componentMap.set(root, []);
    componentMap.get(root)!.push(article);
  });

  const finalGroups: GroupedFeedItem[] = [];
  const groupedArticleIds = new Set<number>();

  componentMap.forEach(group => {
    if (group.length <= 1) return;

    // Choisir comme mainArticle celui qui a une miniature si possible
    const mainArticle = group.find(a => a.thumbnailUrl && a.thumbnailUrl.trim() !== '') || group[0];
    if (!mainArticle?.title) return;

    group.forEach(a => groupedArticleIds.add(a.id));

    const sources = group.map(a => ({
      faviconUrl: a.feed?.faviconUrl,
      title: a.feed?.title,
    }));

    finalGroups.push({
      isGroup: true,
      id: `group-${mainArticle.id}`,
      title: `Actualité : ${mainArticle.title}`,
      mainArticle,
      articles: group.filter(a => a.id !== mainArticle.id),
      sources,
    });
  });

  const ungroupedArticles = uniqueArticles.filter(article => !groupedArticleIds.has(article.id));
  return [...finalGroups, ...ungroupedArticles];
}

export function isGroupedFeedItem(item: ProcessedFeedItem): item is GroupedFeedItem {
  return 'isGroup' in item && item.isGroup;
}
