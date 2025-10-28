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

  // Parse HTML using browser's DOMParser
  const parser = new DOMParser();
  let doc = parser.parseFromString(html, 'text/html');

  // Some sites return escaped HTML (e.g. "&lt;h2&gt;..."). Detect and decode.
  const bodyText = doc.body && doc.body.childNodes.length === 1 && doc.body.firstChild?.nodeType === 3
    ? (doc.body.firstChild.textContent || '')
    : '';
  if (bodyText.startsWith('<') && /<\/?[a-zA-Z]/.test(bodyText)) {
    // The body contains a single text node that looks like escaped HTML. Decode it.
    try {
      const decoded = parser.parseFromString(bodyText, 'text/html');
      doc = decoded;
    } catch {
      // ignore and continue with original doc
    }
  }

  // Set base URL if provided (for resolving relative URLs)
  if (url && doc.head) {
    const base = doc.createElement('base');
    base.href = url;
    doc.head.insertBefore(base, doc.head.firstChild);
  }

  // Clone document for Readability (it modifies the DOM)
  const documentClone = doc.cloneNode(true) as Document;

  // Extract article using Mozilla's Readability
  const reader = new Readability(documentClone, {
    // Maximum number of elements to parse
    maxElemsToParse: 0, // 0 = no limit
    // Number of top candidates to consider when analyzing the page
    nbTopCandidates: 5,
    // Character count required for a paragraph to be considered content
    charThreshold: 500,
    // Whether to keep classes on elements
    keepClasses: false,
  });

  const article = reader.parse();

  // Check if extraction was successful
  if (!article || !article.content || !article.title) {
    return null;
  }

  // Check if article meets minimum length requirement
  if ((article.length ?? 0) < minTextLength) {
    return null;
  }

  // Post-process the extracted HTML to recover lazy-loaded images and common embed patterns
  try {
    const fragParser = new DOMParser();
    // If article.content itself contains escaped HTML, decode similarly
    let fragDoc = fragParser.parseFromString(article.content, 'text/html');
    const fragBodyText = fragDoc.body && fragDoc.body.childNodes.length === 1 && fragDoc.body.firstChild?.nodeType === 3
      ? (fragDoc.body.firstChild.textContent || '')
      : '';
    if (fragBodyText.startsWith('<') && /<\/?[a-zA-Z]/.test(fragBodyText)) {
      try {
        fragDoc = fragParser.parseFromString(fragBodyText, 'text/html');
      } catch {
        // ignore
      }
    }

    // Helper to set src from common data- attributes
    const ensureImgSrc = (img: HTMLImageElement) => {
      if (img.src && img.src.trim()) return;
      const candidates = [
        'data-src',
        'data-lazy-src',
        'data-original',
        'data-srcset',
        'data-lazy',
        'data-actualsrc',
      ];
      for (const attr of candidates) {
        const v = img.getAttribute(attr);
        if (v) {
          // If srcset-like value, take first url
          const first = v.split(',')[0].trim().split(' ')[0];
          img.src = first;
          break;
        }
      }
    };

    // Fix <noscript> fallbacks: many sites put a real <img> inside <noscript>
    fragDoc.querySelectorAll('noscript').forEach((n) => {
      try {
        const html = n.textContent || '';
        if (!html) return;
        const sub = fragParser.parseFromString(html, 'text/html');
        const imgs = sub.querySelectorAll('img');
        imgs.forEach((si) => {
          const img = fragDoc.createElement('img');
          // copy attributes
          for (const a of Array.from(si.attributes)) img.setAttribute(a.name, a.value);
          n.parentElement?.replaceChild(img, n);
        });
      } catch {
        // ignore malformed noscript content
      }
    });

    // Ensure images have a usable src
    fragDoc.querySelectorAll('img').forEach((img) => {
      ensureImgSrc(img as HTMLImageElement);
    });

    // Handle iframes that use data-src or lazy attributes
    fragDoc.querySelectorAll('iframe').forEach((ifr) => {
      if (!ifr.getAttribute('src')) {
        const ds = ifr.getAttribute('data-src') || ifr.getAttribute('data-lazy-src');
        if (ds) ifr.setAttribute('src', ds);
      }
    });

    // serialize back
    article.content = fragDoc.body.innerHTML;
  } catch {
    // non-fatal: if post-processing fails, return the original content
  }

  return {
    title: article.title,
    byline: article.byline ?? null,
    content: article.content,
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
