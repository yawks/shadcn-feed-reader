/**
 * Article content extraction using Mozilla's Readability
 * 
 * This is the same algorithm used by Firefox Reader View.
 * It extracts the main article content while removing:
 * - Headers, footers, navigation menus
 * - Sidebars and related content
 * - Ads and promotional content
 * - Share buttons and social widgets
 * 
 * It preserves:
 * - Article title and byline
 * - Main text content
 * - Images within the article
 * - Embedded videos (YouTube, Vimeo, etc.)
 * - Embedded social content (Twitter, Instagram, etc.)
 */

import { Readability } from '@mozilla/readability';

/**
 * Gets title from an element
 */
function getTitleFromElement(elem: Element): string {
  if (elem.tagName === 'META') {
    return elem.getAttribute('content') || '';
  }
  return elem.textContent?.trim() || '';
}

/**
 * Tries to extract title from document using selectors
 */
function tryExtractTitleFromSelectors(doc: Document): string {
  const titleSelectors = [
    'h1',
    'article h1',
    'article h2',
    '.article-title',
    '.post-title',
    '[itemprop="headline"]',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ];
  
  for (const selector of titleSelectors) {
    const elem = doc.querySelector(selector);
    if (!elem) continue;
    
    const title = getTitleFromElement(elem);
    if (title.length > 0) return title;
  }
  
  return '';
}

/**
 * Extracts title from document using various strategies
 */
function extractTitle(doc: Document, readabilityTitle?: string | null): string {
  // If Readability found a title, use it
  if (readabilityTitle && readabilityTitle.trim().length > 0) {
    return readabilityTitle;
  }

  // Try common title selectors
  const selectorTitle = tryExtractTitleFromSelectors(doc);
  if (selectorTitle) return selectorTitle;
  
  // Last resort: use document title
  return doc.title || '';
}

/**
 * Sets image src from srcset or data attributes
 */
function ensureImageSrc(img: HTMLImageElement): void {
  const currentSrc = img.src?.trim();
  const hasValidSrc = currentSrc && !currentSrc.startsWith('data:') && currentSrc.length > 10;
  
  // Try srcset first (often has better quality)
  if (!hasValidSrc) {
    const srcFromSrcset = extractFromSrcset(img);
    if (srcFromSrcset) {
      img.src = srcFromSrcset;
      return;
    }
  }
  
  // Try data attributes
  if (!hasValidSrc) {
    const srcFromData = extractFromDataAttributes(img);
    if (srcFromData) {
      img.src = srcFromData;
    }
  }
}

/**
 * Extracts image URL from srcset attribute
 */
function extractFromSrcset(img: HTMLImageElement): string | null {
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
  if (!srcset || !srcset.trim()) return null;
  
  // Parse srcset and get the largest image (last in the list)
  const sources = srcset.split(',').map(s => s.trim()).filter(Boolean);
  if (sources.length === 0) return null;
  
  // Get the URL from the last (largest) source
  const largestSource = sources[sources.length - 1];
  const url = largestSource.split(' ')[0];
  
  return (url && url.length > 10) ? url : null;
}

/**
 * Extracts image URL from data attributes
 */
function extractFromDataAttributes(img: HTMLImageElement): string | null {
  const candidates = [
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-lazy',
    'data-actualsrc',
  ];
  
  for (const attr of candidates) {
    const v = img.getAttribute(attr);
    if (!v) continue;
    
    // If srcset-like value, take first url
    const first = v.split(',')[0].trim().split(' ')[0];
    if (first && first.length > 10) {
      return first;
    }
  }
  
  return null;
}

/**
 * Fixes noscript fallbacks by extracting real images
 */
function fixNoscriptImages(doc: Document): void {
  const parser = new DOMParser();
  
  doc.querySelectorAll('noscript').forEach((n) => {
    try {
      const html = n.textContent || '';
      if (!html) return;
      
      const sub = parser.parseFromString(html, 'text/html');
      const imgs = sub.querySelectorAll('img');
      
      imgs.forEach((si) => {
        const img = doc.createElement('img');
        // Copy all attributes
        for (const a of Array.from(si.attributes)) {
          img.setAttribute(a.name, a.value);
        }
        n.parentElement?.replaceChild(img, n);
      });
    } catch {
      // Ignore malformed noscript content
    }
  });
}

/**
 * Fixes lazy-loaded iframes
 */
function fixLazyIframes(doc: Document): void {
  doc.querySelectorAll('iframe').forEach((ifr) => {
    if (ifr.getAttribute('src')) return;
    
    const ds = ifr.getAttribute('data-src') || ifr.getAttribute('data-lazy-src');
    if (ds) {
      ifr.setAttribute('src', ds);
    }
  });
}

/**
 * Finds the article container element in the document
 */
function findArticleContainer(doc: Document): Element | null {
  // Try common article container selectors in order of specificity
  // Prioritize main > article to ensure we get the actual content
  const selectors = [
    'main article',
    'main section',
    'main',
    'article',
    '[role="main"]',
    '.article-content',
    '.post-content',
    '#content article',
    '#main-content',
  ];
  
  for (const selector of selectors) {
    const elem = doc.querySelector(selector);
    if (elem) return elem;
  }
  
  return null;
}

/**
 * Checks if an element is inside an aside
 */
function isInsideAside(elem: Element): boolean {
  let current: Element | null = elem;
  while (current) {
    if (current.tagName === 'ASIDE') {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Collects images from the article content area only
 */
function collectOriginalImages(originalDoc: Document, processedContent: string): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];
  
  // Find the article container
  const container = findArticleContainer(originalDoc);
  if (!container) return images;
  
  // Get all images from the article container
  const imgs = container.querySelectorAll('img');
  
  // Parse processed content to get image URLs that Readability kept
  const parser = new DOMParser();
  const processedDoc = parser.parseFromString(processedContent, 'text/html');
  const keptImageUrls = new Set<string>();
  processedDoc.querySelectorAll('img').forEach((img) => {
    if (img.src) keptImageUrls.add(img.src);
    // Also check srcset
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach(s => {
        const url = s.trim().split(' ')[0];
        if (url) keptImageUrls.add(url);
      });
    }
  });
  
  imgs.forEach((img) => {
    // Skip images inside aside elements
    if (isInsideAside(img)) {
      return;
    }
    
    // Clone the image to preserve it
    const clone = img.cloneNode(true) as HTMLImageElement;
    // Ensure it has a valid src
    ensureImageSrc(clone);
    
    // Only keep images with valid src
    if (!clone.src || clone.src.length <= 10 || clone.src.startsWith('data:')) {
      return;
    }
    
    // Only collect images that were NOT kept by Readability
    if (!keptImageUrls.has(clone.src)) {
      images.push(clone);
    }
  });
  
  return images;
}

/**
 * Merges original images into processed content
 * Only adds images that are truly missing (already filtered by collectOriginalImages)
 */
function mergeOriginalImages(doc: Document, originalImages: HTMLImageElement[]): void {
  if (originalImages.length === 0) return;
  
  // Insert images after the title (h1) if present
  const h1 = doc.querySelector('h1');
  const insertionPoint = h1 ? h1.nextSibling : doc.body.firstChild;
  
  if (!insertionPoint) return;
  
  const fragment = doc.createDocumentFragment();
  originalImages.forEach(img => {
    const figure = doc.createElement('figure');
    figure.appendChild(img.cloneNode(true));
    if (img.alt) {
      const figcaption = doc.createElement('figcaption');
      figcaption.textContent = img.alt;
      figure.appendChild(figcaption);
    }
    fragment.appendChild(figure);
  });
  
  // Insert after h1 or at the beginning
  if (h1 && h1.nextSibling) {
    h1.parentNode?.insertBefore(fragment, h1.nextSibling);
  } else {
    doc.body.insertBefore(fragment, insertionPoint);
  }
}

/**
 * Removes duplicate images from document
 */
function removeDuplicateImages(doc: Document): void {
  const seenUrls = new Set<string>();
  const imagesToRemove: HTMLImageElement[] = [];
  
  doc.querySelectorAll('img').forEach((img) => {
    const src = (img as HTMLImageElement).src;
    if (!src) return;
    
    if (seenUrls.has(src)) {
      // Mark for removal
      imagesToRemove.push(img as HTMLImageElement);
    } else {
      seenUrls.add(src);
    }
  });
  
  // Remove duplicates
  imagesToRemove.forEach((img) => {
    // Remove the parent figure if it exists, otherwise just the img
    const parent = img.parentElement;
    if (parent && parent.tagName === 'FIGURE') {
      parent.remove();
    } else {
      img.remove();
    }
  });
}

/**
 * Removes all aside elements and their content
 */
function removeAsides(doc: Document): void {
  doc.querySelectorAll('aside').forEach((aside) => {
    aside.remove();
  });
}

/**
 * Removes non-content elements (header, nav, footer) that are not inside main/article
 */
function removeNonContentElements(doc: Document): void {
  // Find if there's a main or article element
  const mainContent = doc.querySelector('main, article, [role="main"]');
  
  if (!mainContent) {
    // If no main content identified, just remove top-level nav/footer
    doc.querySelectorAll('body > header, body > nav, body > footer').forEach((elem) => {
      elem.remove();
    });
    return;
  }
  
  // Remove header, nav, footer that are NOT inside the main content area
  const selectorsToClean = ['header', 'nav', 'footer'];
  
  selectorsToClean.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((elem) => {
      // Check if this element is inside the main content
      if (!mainContent.contains(elem)) {
        elem.remove();
      } else {
        // Even inside main, remove if it's a direct child (page header, not article header)
        if (elem.parentElement === mainContent && selector !== 'header') {
          elem.remove();
        }
      }
    });
  });
}

/**
 * Post-processes extracted HTML to recover images and embeds
 */
function postProcessContent(content: string, title: string, originalImages: HTMLImageElement[]): string {
  const parser = new DOMParser();
  let doc = parser.parseFromString(content, 'text/html');
  
  // Handle escaped HTML
  const bodyText = doc.body && doc.body.childNodes.length === 1 && doc.body.firstChild?.nodeType === 3
    ? (doc.body.firstChild.textContent || '')
    : '';
    
  if (bodyText.startsWith('<') && /<\/?[a-zA-Z]/.test(bodyText)) {
    try {
      doc = parser.parseFromString(bodyText, 'text/html');
    } catch {
      // Ignore and use original
    }
  }

  // Remove all aside elements (sidebars, related content, etc.)
  removeAsides(doc);
  
  // Remove non-content elements (header, nav, footer outside main)
  removeNonContentElements(doc);

  // Fix noscript image fallbacks
  fixNoscriptImages(doc);
  
  // Ensure all images have usable src
  doc.querySelectorAll('img').forEach((img) => {
    ensureImageSrc(img as HTMLImageElement);
  });
  
  // Merge images from original document that were lost
  mergeOriginalImages(doc, originalImages);
  
  // Remove duplicate images
  removeDuplicateImages(doc);
  
  // Fix lazy-loaded iframes
  fixLazyIframes(doc);
  
  // Add title as H1 at the very beginning (after all other processing)
  const h1 = doc.createElement('h1');
  h1.textContent = title;
  doc.body.insertBefore(h1, doc.body.firstChild);
  
  return doc.body.innerHTML;
}

export interface ArticleContent {
  title: string;
  byline: string | null;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  siteName: string | null;
}

export interface ExtractOptions {
  url?: string;
  /** Minimum text length to consider extraction successful */
  minTextLength?: number;
}

/**
 * Parses HTML string and handles escaped content
 */
function parseHTML(html: string): Document {
  const parser = new DOMParser();
  let doc = parser.parseFromString(html, 'text/html');

  // Some sites return escaped HTML (e.g. "&lt;h2&gt;..."). Detect and decode.
  const bodyText = doc.body && doc.body.childNodes.length === 1 && doc.body.firstChild?.nodeType === 3
    ? (doc.body.firstChild.textContent || '')
    : '';
    
  if (bodyText.startsWith('<') && /<\/?[a-zA-Z]/.test(bodyText)) {
    try {
      doc = parser.parseFromString(bodyText, 'text/html');
    } catch {
      // Continue with original doc
    }
  }

  return doc;
}

/**
 * Sets base URL for resolving relative URLs
 */
function setBaseURL(doc: Document, url: string): void {
  if (!url || !doc.head) return;
  
  const base = doc.createElement('base');
  base.href = url;
  doc.head.insertBefore(base, doc.head.firstChild);
}

/**
 * Extracts article content from HTML string
 * 
 * @param html Raw HTML string
 * @param options Extraction options
 * @returns Extracted article or null if extraction failed
 */
export function extractArticle(
  html: string,
  options: ExtractOptions = {}
): ArticleContent | null {
  const { url = '', minTextLength = 250 } = options;

  // Parse HTML
  const doc = parseHTML(html);

  // Set base URL for resolving relative URLs
  setBaseURL(doc, url);

  // Clone document for Readability (it modifies the DOM)
  const documentClone = doc.cloneNode(true) as Document;

  // Pre-clean the document before Readability to help it focus on main content
  // Remove asides and non-content elements
  removeAsides(documentClone);
  removeNonContentElements(documentClone);

  // Extract article using Mozilla's Readability
  const reader = new Readability(documentClone, {
    maxElemsToParse: 0, // 0 = no limit
    nbTopCandidates: 5,
    charThreshold: 500,
    keepClasses: false,
  });

  const article = reader.parse();

  // Check if extraction was successful
  if (!article || !article.content) {
    return null;
  }

  // Extract title with fallback strategies
  const title = extractTitle(doc, article.title);
  
  // If still no title, extraction failed
  if (!title || title.trim().length === 0) {
    return null;
  }

  // Check if article meets minimum length requirement
  if ((article.length ?? 0) < minTextLength) {
    return null;
  }

  // Collect images from original document that were lost by Readability
  // We do this after extraction to compare with what was kept
  const originalImages = collectOriginalImages(doc, article.content);

  // Post-process the extracted HTML to recover lazy-loaded images and embeds
  let processedContent = article.content;
  try {
    processedContent = postProcessContent(article.content, title, originalImages);
  } catch {
    // Non-fatal: if post-processing fails, use original content
  }

  return {
    title,
    byline: article.byline ?? null,
    content: processedContent,
    textContent: article.textContent ?? '',
    length: article.length ?? 0,
    excerpt: article.excerpt ?? '',
    siteName: article.siteName ?? null,
  };
}

/**
 * Simple helper to check if content extraction is likely to succeed
 */
export function canExtractArticle(html: string): boolean {
  // Quick heuristic checks
  if (!html || html.length < 500) {
    return false;
  }

  // Check for common article indicators
  const hasArticleTag = /<article/i.test(html);
  const hasMainTag = /<main/i.test(html);
  const hasParagraphs = (html.match(/<p/gi) || []).length > 3;

  return hasArticleTag || hasMainTag || hasParagraphs;
}
