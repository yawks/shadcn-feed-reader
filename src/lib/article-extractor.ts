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
 * Decodes HTML entities in a string safely
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  const temp = document.createElement('div');
  temp.textContent = '';
  // nosemgrep: javascript.browser.security.insecure-innerhtml, javascript.browser.security.insecure-document-method
  temp.innerHTML = text;
  return temp.textContent || temp.innerText || text;
}

/**
 * Gets title from an element
 */
function getTitleFromElement(elem: Element): string {
  if (elem.tagName === 'META') {
    const content = elem.getAttribute('content') || '';
    return decodeHtmlEntities(content);
  }
  const text = elem.textContent?.trim() || '';
  return decodeHtmlEntities(text);
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
    '.fig-headline',
    'h1.fig-headline',
    '[itemprop="headline"]',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    '[class*="headline"]',
    '[class*="title"]',
  ];
  
  for (const selector of titleSelectors) {
    try {
      const elem = doc.querySelector(selector);
      if (!elem) continue;
      
      const title = getTitleFromElement(elem);
      if (title.length > 0) return title;
    } catch {
      // Ignore selector errors
    }
  }
  
  return '';
}

/**
 * Extracts title from document using various strategies
 */
function extractTitle(doc: Document, readabilityTitle?: string | null): string {
  if (readabilityTitle && readabilityTitle.trim().length > 0) {
    return decodeHtmlEntities(readabilityTitle);
  }

  const selectorTitle = tryExtractTitleFromSelectors(doc);
  if (selectorTitle) return selectorTitle;
  
  return decodeHtmlEntities(doc.title || '');
}

/**
 * Checks if an image src is likely a placeholder
 */
function isPlaceholderSrc(src: string): boolean {
  if (!src) return true;
  const lower = src.toLowerCase();
  return lower.includes('default') ||
         lower.includes('placeholder') ||
         lower.includes('blank') ||
         lower.includes('spacer') ||
         lower.includes('1x1') ||
         lower.includes('pixel') ||
         lower.match(/0+\.(jpg|png|gif|webp)$/i) !== null;
}

/**
 * Checks if a string looks like a URL
 */
function looksLikeUrl(str: string): boolean {
  if (!str || str.length < 10) return false;
  return /^(https?:\/\/|\/\/|\/)/i.test(str.trim()) || str.includes('.');
}

/**
 * Sets image src from srcset or data attributes
 */
function ensureImageSrc(img: HTMLImageElement): void {
  const resolvedSrc = img.src?.trim();
  const srcAttr = img.getAttribute('src')?.trim();
  const currentSrc = resolvedSrc || srcAttr || '';
  
  const isPlaceholder = currentSrc ? (isPlaceholderSrc(resolvedSrc || '') || isPlaceholderSrc(srcAttr || '')) : true;
  const hasValidSrc = currentSrc && !currentSrc.startsWith('data:') && currentSrc.length > 10 && !isPlaceholder;
  
  const srcFromData = extractFromDataAttributes(img);
  if (srcFromData) {
    img.src = srcFromData;
    return;
  }
  
  if (!hasValidSrc || isPlaceholder) {
    const srcFromSrcset = extractFromSrcset(img);
    if (srcFromSrcset) {
      img.src = srcFromSrcset;
      return;
    }
  }
}

/**
 * Extracts image URL from srcset attribute
 */
function extractFromSrcset(img: HTMLImageElement): string | null {
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
  if (!srcset || !srcset.trim()) return null;
  
  const sources = srcset.split(',').map(s => s.trim()).filter(Boolean);
  if (sources.length === 0) return null;
  
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
    'data-actualsrc',
    'data-lazy',
  ];
  
  for (const attr of candidates) {
    const v = img.getAttribute(attr);
    if (!v) continue;
    
    const first = v.split(',')[0].trim().split(' ')[0];
    if (first && looksLikeUrl(first)) {
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
  const selectors = [
    'main article',
    'main section',
    'main',
    'article',
    '[role="main"]',
    '.article-content',
    '.post-content',
    '.content',
    '.entry-content',
    '.article-body',
    '.post-body',
    '[itemtype*="Article"]',
    '[itemtype*="BlogPosting"]',
    '#content article',
    '#main-content',
  ];
  
  for (const selector of selectors) {
    const elem = doc.querySelector(selector);
    if (elem) return elem;
  }
  
  const body = doc.body;
  if (body) {
    const divs = body.querySelectorAll('div');
    let bestContainer: Element | null = null;
    let maxTextLength = 0;
    
    for (const div of Array.from(divs)) {
      const textLength = div.textContent?.trim().length || 0;
      if (textLength > 500 && textLength > maxTextLength) {
        const classList = div.className?.toLowerCase() || '';
        const id = div.id?.toLowerCase() || '';
        if (!classList.includes('sidebar') && 
            !classList.includes('nav') && 
            !classList.includes('menu') &&
            !id.includes('sidebar') &&
            !id.includes('nav') &&
            !id.includes('menu')) {
          bestContainer = div;
          maxTextLength = textLength;
        }
      }
    }
    
    if (bestContainer) {
      return bestContainer;
    }
  }
  
  return doc.body;
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
 * Checks if an image is an avatar or in a header/author section
 */
function isAvatarOrHeaderImage(img: HTMLImageElement): boolean {
  // Check for avatar classes
  if (img.classList.contains('c-avatar') || 
      img.classList.contains('avatar') ||
      img.classList.contains('author-avatar') ||
      img.classList.contains('user-avatar')) {
    return true;
  }
  
  // Check if inside header, address, or author-related containers
  let current: Element | null = img;
  while (current) {
    const tagName = current.tagName;
    const className = current.className || '';
    
    if (tagName === 'HEADER' || 
        tagName === 'ADDRESS' ||
        className.includes('author') ||
        className.includes('byline') ||
        className.includes('journalist') ||
        className.includes('avatar-group')) {
      return true;
    }
    
    current = current.parentElement;
  }
  
  return false;
}

/**
 * Checks if an image is in a media/gallery container (likely main content image)
 */
function isInMediaOrGallery(img: HTMLImageElement): boolean {
  let current: Element | null = img;
  while (current) {
    const className = current.className || '';
    const id = current.id || '';
    
    // Check for gallery/media containers
    if (className.includes('pswp-gallery') ||
        className.includes('gallery') ||
        className.includes('c-media') ||
        className.includes('c-img') ||
        className.includes('photo-gallery') ||
        className.includes('media-gallery') ||
        id.includes('gallery') ||
        id.includes('photoswipe')) {
      return true;
    }
    
    current = current.parentElement;
  }
  
  return false;
}

/**
 * Normalizes an image URL for comparison
 */
function normalizeImageUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    pathname = pathname.replace(/\/images\/(\d{3,4})\//g, '/images/');
    pathname = pathname.replace(/\/(\d{3,4})x(\d{3,4})\//g, '/');
    pathname = pathname.replace(/\/(thumb|thumbnails|resized|small|medium|large)\//gi, '/');
    
    return urlObj.origin + pathname;
  } catch {
    let normalized = url.split('?')[0].split('#')[0];
    normalized = normalized.replace(/\/images\/(\d{3,4})\//g, '/images/');
    normalized = normalized.replace(/\/(\d{3,4})x(\d{3,4})\//g, '/');
    normalized = normalized.replace(/\/(thumb|thumbnails|resized|small|medium|large)\//gi, '/');
    return normalized;
  }
}

/**
 * Gets a signature for an image based on alt text and figcaption
 */
function getImageSignature(img: HTMLImageElement): string | null {
  const alt = img.getAttribute('alt')?.trim().toLowerCase() || '';
  const figcaption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim().toLowerCase() || '';
  
  const signature = figcaption || alt;
  
  return signature.length > 10 ? signature : null;
}

/**
 * Gets image width from attributes or natural width
 */
function getImageWidth(img: HTMLImageElement): number | null {
  const widthAttr = img.getAttribute('width');
  if (widthAttr) {
    const width = parseInt(widthAttr, 10);
    if (!isNaN(width) && width > 0) return width;
  }
  
  if (img.naturalWidth && img.naturalWidth > 0) {
    return img.naturalWidth;
  }
  
  const styleAttr = img.getAttribute('style');
  if (styleAttr) {
    const widthMatch = styleAttr.match(/width\s*:\s*(\d+)px/i);
    if (widthMatch) {
      const width = parseInt(widthMatch[1], 10);
      if (!isNaN(width) && width > 0) return width;
    }
  }
  
  const computedWidth = img.offsetWidth || img.clientWidth;
  if (computedWidth && computedWidth > 0) {
    return computedWidth;
  }
  
  const src = img.src || img.getAttribute('src') || '';
  const dimensionMatch = src.match(/(\d+)x(\d+)/);
  if (dimensionMatch) {
    const width = parseInt(dimensionMatch[1], 10);
    if (!isNaN(width) && width > 0) return width;
  }
  
  return null;
}

/**
 * Checks if an element is inside article content
 */
function isInArticleContent(elem: Element): boolean {
  let current: Element | null = elem;
  const excludedTags = ['FOOTER', 'ASIDE', 'NAV', 'HEADER'];
  const excludedClassPatterns = [
    /footer/i,
    /sidebar/i,
    /bottom/i,
    /side-bar/i,
    /side_bar/i,
    /widget/i,
    /advertisement/i,
    /ad/i,
    /promo/i,
    /related/i,
    /recommended/i,
    /suggested/i,
    /comments/i,
    /comment/i,
    /social/i,
    /share/i,
    /newsletter/i,
    /subscription/i,
    /comp-box/i,
    /recirculation/i,
    /post-tags/i,
    /post-source/i,
  ];
  const excludedIdPatterns = [
    /footer/i,
    /sidebar/i,
    /bottom/i,
    /side-bar/i,
    /side_bar/i,
    /widget/i,
    /advertisement/i,
    /ad/i,
    /comment/i,
    /comments/i,
  ];
  
  while (current) {
    const tagName = current.tagName;
    const id = current.id || '';
    
    let classNameStr = '';
    if (typeof current.className === 'string') {
      classNameStr = current.className;
    } else if (current.className && typeof current.className === 'object') {
      classNameStr = Array.from(current.className).join(' ');
    }
    
    if (classNameStr && /featured|hero|main-image|article-image|post-image/i.test(classNameStr)) {
      let parent = current.parentElement;
      while (parent) {
        const parentClassName = typeof parent.className === 'string' 
          ? parent.className 
          : (parent.className ? Array.from(parent.className).join(' ') : '');
        if (parentClassName && excludedClassPatterns.some(pattern => pattern.test(parentClassName))) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    }
    
    if (excludedTags.includes(tagName)) {
      return false;
    }
    
    if (classNameStr && excludedClassPatterns.some(pattern => pattern.test(classNameStr))) {
      return false;
    }
    
    if (id && excludedIdPatterns.some(pattern => pattern.test(id))) {
      return false;
    }
    
    const dataAttrs = Array.from(current.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => attr.value.toLowerCase());
    
    if (dataAttrs.some(attr => 
      /recirculation/i.test(attr) || 
      /ad/i.test(attr) || 
      /widget/i.test(attr) ||
      /promo/i.test(attr)
    )) {
      return false;
    }
    
    if (tagName === 'MAIN' || tagName === 'ARTICLE') {
      return true;
    }
    
    current = current.parentElement;
  }
  
  return true;
}

/**
 * Checks if an image is likely a related article thumbnail
 */
function isRelatedArticleImage(img: HTMLImageElement, doc: Document): boolean {
  let current: Element | null = img;
  while (current) {
    if (current.tagName === 'UL' || current.tagName === 'OL' || current.tagName === 'LI') {
      const className = typeof current.className === 'string' 
        ? current.className 
        : (current.className ? Array.from(current.className).join(' ') : '');
      if (className && /related|recommended|suggested|grid/i.test(className)) {
        return true;
      }
      const list = current.tagName === 'UL' || current.tagName === 'OL' ? current : current.closest('ul, ol');
      if (list) {
        const imagesInList = list.querySelectorAll('img').length;
        if (imagesInList >= 3) {
          return true;
        }
      }
    }
    current = current.parentElement;
  }
  
  const imgClassName = typeof img.className === 'string' 
    ? img.className 
    : (img.className ? Array.from(img.className).join(' ') : '');
  
  if (imgClassName && /w-full.*object-cover|object-cover.*w-full/i.test(imgClassName)) {
    if (!imgClassName.includes('featured') && !imgClassName.includes('hero')) {
      const allImages = Array.from(doc.querySelectorAll('img'));
      const similarImages = allImages.filter(otherImg => {
        const otherClassName = typeof otherImg.className === 'string' 
          ? otherImg.className 
          : (otherImg.className ? Array.from(otherImg.className).join(' ') : '');
        return otherClassName && /w-full.*object-cover|object-cover.*w-full/i.test(otherClassName);
      });
      if (similarImages.length >= 3) {
        return true;
      }
    }
  }
  
  current = img;
  while (current) {
    const className = typeof current.className === 'string' 
      ? current.className 
      : (current.className ? Array.from(current.className).join(' ') : '');
    if (className && /grid.*cols|grid-cols/i.test(className)) {
      const grid = current;
      const imagesInGrid = grid.querySelectorAll('img').length;
      if (imagesInGrid >= 3) {
        return true;
      }
    }
    current = current.parentElement;
  }
  
  const body = doc.body;
  if (body) {
    const allImages = Array.from(body.querySelectorAll('img'));
    const imgIndex = allImages.indexOf(img);
    
    if (imgIndex > 0 && allImages.length >= 3) {
      let consecutiveCount = 1;
      for (let i = imgIndex + 1; i < allImages.length; i++) {
        const prevImg = allImages[i - 1];
        const currImg = allImages[i];
        const prevParent = prevImg.parentElement;
        const currParent = currImg.parentElement;
        if (prevParent === currParent || 
            (prevParent && currParent && prevParent.nextSibling === currParent) ||
            (prevParent && currParent && currParent.previousSibling === prevParent)) {
          consecutiveCount++;
        } else {
          break;
        }
      }
      
      if (consecutiveCount >= 3) {
        return true;
      }
      
      if (imgIndex > 0 && allImages.length >= 3) {
        const widths = allImages.slice(1).map(i => getImageWidth(i)).filter(w => w !== null) as number[];
        if (widths.length >= 3) {
          const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
          const variance = widths.reduce((sum, w) => sum + Math.pow(w - avgWidth, 2), 0) / widths.length;
          if (variance < 100000 && avgWidth > 1000 && avgWidth < 1500) {
            return true;
          }
        }
      }
    }
    
    const allElements = Array.from(body.querySelectorAll('*'));
    const elementIndex = allElements.indexOf(img);
    const textElements = allElements.filter(el => 
      el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'BLOCKQUOTE'
    );
    if (textElements.length > 0) {
      const lastTextIndex = Math.max(...textElements.map(el => allElements.indexOf(el)));
      if (elementIndex > lastTextIndex * 0.8 && elementIndex !== allElements.length - 1) {
        const imagesAfter = Array.from(body.querySelectorAll('img'))
          .filter(otherImg => allElements.indexOf(otherImg) > lastTextIndex * 0.8);
        if (imagesAfter.length >= 3) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Filters out small images and non-content images
 */
function filterSmallImages(doc: Document): void {
  const imagesToRemove: HTMLImageElement[] = [];
  
  doc.querySelectorAll('img').forEach((img) => {
    const imgEl = img as HTMLImageElement;
    
    // Exclude avatars and header images
    if (isAvatarOrHeaderImage(imgEl)) {
      imagesToRemove.push(imgEl);
      return;
    }
    
    if (!isInArticleContent(imgEl)) {
      imagesToRemove.push(imgEl);
      return;
    }
    
    if (isRelatedArticleImage(imgEl, doc)) {
      imagesToRemove.push(imgEl);
      return;
    }
    
    const width = getImageWidth(imgEl);
    
    // Remove tiny images (< 400px) regardless of classes - these are thumbnails
    if (width !== null && width < 400) {
      imagesToRemove.push(imgEl);
      return;
    }
    
    const allImages = Array.from(doc.querySelectorAll('img'));
    const imageIndex = allImages.indexOf(imgEl);
    const isInGallery = isInMediaOrGallery(imgEl);
    const isMainImage = 
      imgEl.classList.contains('wp-post-image') ||
      imgEl.classList.contains('attachment-post-thumbnail') ||
      imgEl.classList.contains('featured') ||
      imgEl.classList.contains('article-main-image') ||
      imgEl.classList.contains('c-img') ||
      imgEl.closest('.featured, .post-image, .entry-image, figure.post-image, .photo, .article-image, .hero-image, .c-media, .c-img, .pswp-gallery, [class*="gallery"], [id*="gallery"]') !== null ||
      (imgEl.closest('figure') && imgEl.closest('figure')?.querySelector('figcaption') !== null) ||
      isInGallery ||
      (imageIndex < 3 && width !== null && width >= 400);
    
    // For images between 400-800px, only remove if NOT a main image
    if (width !== null && width < 800) {
      if (!isMainImage) {
        imagesToRemove.push(imgEl);
      }
    }
  });
  
  imagesToRemove.forEach((img) => {
    if (!img.isConnected) {
      return;
    }
    
    try {
      const parent = img.parentElement;
      if (parent && parent.tagName === 'FIGURE') {
        parent.remove();
      } else {
        img.remove();
      }
    } catch {
      try {
        const parent = img.parentElement;
        if (parent) {
          parent.remove();
        }
      } catch {
        // Ignore
      }
    }
  });
}

/**
 * Collects images from the article content area only
 */
function collectOriginalImages(originalDoc: Document, processedContent: string): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];
  
  const container = findArticleContainer(originalDoc);
  if (!container) return images;
  
  // Collect images from the article container
  const containerImgs = Array.from(container.querySelectorAll('img'));
  
  // Also collect images from nearby siblings and gallery containers (for galleries outside article tag)
  // This handles cases like 20minutes.fr where the gallery is before the <article> tag
  const nearbyGalleryImgs: HTMLImageElement[] = [];
  
  // Check previous siblings (galleries are often before the article)
  let sibling = container.previousElementSibling;
  let siblingCount = 0;
  
  while (sibling && siblingCount < 5) {
    // Check if this sibling is a gallery container
    const isGallery = sibling.classList.contains('pswp-gallery') ||
      sibling.id?.includes('gallery') ||
      sibling.id?.includes('photoswipe') ||
      sibling.classList.toString().includes('gallery') ||
      sibling.classList.toString().includes('photo-gallery') ||
      sibling.querySelector('.pswp-gallery, [class*="gallery"], [id*="gallery"], .c-media');
    
    if (isGallery || siblingCount < 2) {
      // Include all images from gallery containers, or from first 2 siblings
      const siblingImgs = Array.from(sibling.querySelectorAll('img'));
      nearbyGalleryImgs.push(...siblingImgs);
    }
    sibling = sibling.previousElementSibling;
    siblingCount++;
  }
  
  
  // Check next siblings (less common, but possible)
  sibling = container.nextElementSibling;
  siblingCount = 0;
  while (sibling && siblingCount < 2) {
    const siblingImgs = Array.from(sibling.querySelectorAll('img'));
    nearbyGalleryImgs.push(...siblingImgs);
    sibling = sibling.nextElementSibling;
    siblingCount++;
  }
  
  // Also check parent and ancestor containers for gallery containers
  // The gallery might be in a parent container that contains both the article and the gallery
  const parentContainer = container.parentElement;
  if (parentContainer) {
    // Search for galleries in the parent container (before the article)
    const galleries = parentContainer.querySelectorAll('.pswp-gallery, [id*="photoswipe"], [id*="gallery"], [class*="gallery"]');
    
    galleries.forEach((gallery) => {
      // Only include galleries that appear before the article in the DOM
      const galleryPosition = gallery.compareDocumentPosition(container);
      const isBeforeArticle = !!(galleryPosition & Node.DOCUMENT_POSITION_FOLLOWING);
      
      if (isBeforeArticle) {
        const galleryImgs = Array.from(gallery.querySelectorAll('img'));
        nearbyGalleryImgs.push(...galleryImgs);
      }
    });
    
    // Also look for galleries in grandparent container (one level up)
    const grandparentContainer = parentContainer.parentElement;
    if (grandparentContainer) {
      const grandparentGalleries = grandparentContainer.querySelectorAll('.pswp-gallery, [id*="photoswipe"], [id*="gallery"]');
      
      grandparentGalleries.forEach((gallery) => {
        // Only include galleries that appear before the article
        const galleryPosition = gallery.compareDocumentPosition(container);
        const isBeforeArticle = !!(galleryPosition & Node.DOCUMENT_POSITION_FOLLOWING);
        
        if (isBeforeArticle && !galleries.length) {
          // Only add if we haven't already found galleries in parent
          const galleryImgs = Array.from(gallery.querySelectorAll('img'));
          nearbyGalleryImgs.push(...galleryImgs);
        }
      });
    }
  }
  
  // Combine all images, prioritizing gallery images
  const allImgs = [...nearbyGalleryImgs, ...containerImgs];
  
  const maxImagesToProcess = 100;
  const imgs = Array.from(allImgs).slice(0, maxImagesToProcess);
  
  const parser = new DOMParser();
  const processedDoc = parser.parseFromString(processedContent, 'text/html');
  const keptImageUrls = new Set<string>();
  
  processedDoc.querySelectorAll('img').forEach((img) => {
    if (img.src) keptImageUrls.add(img.src);
    const srcAttr = img.getAttribute('src');
    if (srcAttr) keptImageUrls.add(srcAttr);
    const dataSrc = extractFromDataAttributes(img as HTMLImageElement);
    if (dataSrc) keptImageUrls.add(dataSrc);
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach(s => {
        const url = s.trim().split(' ')[0];
        if (url) keptImageUrls.add(url);
      });
    }
  });
  
  imgs.forEach((img, index) => {
    if (isInsideAside(img)) {
      return;
    }
    
    // Exclude avatars and header images (journalist photos, author avatars, etc.)
    if (isAvatarOrHeaderImage(img)) {
      return;
    }
    
    const clone = img.cloneNode(true) as HTMLImageElement;
    ensureImageSrc(clone);
    
    if (!clone.src || clone.src.length <= 10 || clone.src.startsWith('data:')) {
      return;
    }
    
    const width = getImageWidth(clone);
    
    // Skip tiny images (< 400px) even if they have "main" classes like wp-post-image
    // These are typically thumbnails used for related articles, not the main content image
    if (width !== null && width < 400) {
      return;
    }
    
    const hasWpPostImage = img.classList.contains('wp-post-image');
    const hasAttachmentPostThumbnail = img.classList.contains('attachment-post-thumbnail');
    const hasFeatured = img.classList.contains('featured');
    const hasCImg = img.classList.contains('c-img'); // 20minutes.fr uses c-img class
    const closestContainer = img.closest('.featured, .post-image, .entry-image, figure.post-image, .photo, .article-image, .hero-image, .c-media, .c-img, .pswp-gallery, [class*="gallery"], [id*="gallery"]');
    const hasPhotoContainer = closestContainer !== null;
    const hasFigcaption = img.closest('figure') && img.closest('figure')?.querySelector('figcaption') !== null;
    const isInGallery = isInMediaOrGallery(img);
    const isFirstThree = index < 3 && width !== null && width >= 400;
    
    const isMainImage = 
      hasWpPostImage ||
      hasAttachmentPostThumbnail ||
      hasFeatured ||
      hasCImg ||
      hasPhotoContainer ||
      hasFigcaption ||
      isInGallery ||
      isFirstThree;
    
    // For images between 400-800px, only keep if they're marked as main images
    if (width !== null && width < 800) {
      if (!isMainImage) {
        return;
      }
    }
    
    if (!keptImageUrls.has(clone.src)) {
      images.push(clone);
    }
  });
  
  // Sort images to prioritize gallery/media images and larger images
  images.sort((a, b) => {
    const aInGallery = isInMediaOrGallery(a);
    const bInGallery = isInMediaOrGallery(b);
    
    // Gallery images first
    if (aInGallery && !bInGallery) return -1;
    if (!aInGallery && bInGallery) return 1;
    
    // Then by size (larger first)
    const aWidth = getImageWidth(a) || 0;
    const bWidth = getImageWidth(b) || 0;
    return bWidth - aWidth;
  });
  
  return images;
}

/**
 * Merges original images into processed content
 */
function mergeOriginalImages(doc: Document, originalImages: HTMLImageElement[]): void {
  if (originalImages.length === 0) {
    return;
  }
  
  const h1 = doc.querySelector('h1');
  const insertionPoint = h1 ? h1.nextSibling : doc.body.firstChild;
  
  if (!insertionPoint) {
    return;
  }
  
  const fragment = doc.createDocumentFragment();
  originalImages.forEach((img) => {
    const figure = doc.createElement('figure');
    const clonedImg = img.cloneNode(true) as HTMLImageElement;
    
    // Only mark as article-main-image if width >= 400px to avoid protecting tiny thumbnails
    const width = getImageWidth(img);
    if (width === null || width >= 400) {
      clonedImg.classList.add('article-main-image');
    }
    
    figure.appendChild(clonedImg);
    if (img.alt) {
      const figcaption = doc.createElement('figcaption');
      figcaption.textContent = img.alt;
      figure.appendChild(figcaption);
    }
    fragment.appendChild(figure);
  });
  
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
  const seenSignatures = new Map<string, HTMLImageElement>();
  const imagesToRemove: HTMLImageElement[] = [];
  
  doc.querySelectorAll('img').forEach((img) => {
    const imgEl = img as HTMLImageElement;
    const src = imgEl.src;
    if (!src) return;
    
    const normalizedUrl = normalizeImageUrl(src);
    const srcAttr = img.getAttribute('src');
    const normalizedSrcAttr = srcAttr ? normalizeImageUrl(srcAttr) : null;
    
    const signature = getImageSignature(imgEl);
    
    let isDuplicate = false;
    
    if (seenUrls.has(normalizedUrl) || (normalizedSrcAttr && seenUrls.has(normalizedSrcAttr))) {
      isDuplicate = true;
    }
    else if (signature && seenSignatures.has(signature)) {
      const firstImage = seenSignatures.get(signature)!;
      const firstWidth = getImageWidth(firstImage);
      const currentWidth = getImageWidth(imgEl);
      
      const firstIsMainImage = firstImage.classList.contains('article-main-image');
      const currentIsMainImage = imgEl.classList.contains('article-main-image');
      
      if (currentIsMainImage && !firstIsMainImage) {
        if (firstImage.isConnected && !imagesToRemove.includes(firstImage)) {
          imagesToRemove.push(firstImage);
        }
        seenSignatures.set(signature, imgEl);
        seenUrls.add(normalizedUrl);
        if (normalizedSrcAttr) seenUrls.add(normalizedSrcAttr);
        return;
      } else if (firstIsMainImage && !currentIsMainImage) {
        isDuplicate = true;
      }
      else {
        const firstIsHidden = firstImage.style.display === 'none' || firstImage.classList.contains('responsive');
        const currentIsHidden = imgEl.style.display === 'none' || imgEl.classList.contains('responsive');
        
        if (!currentIsHidden && firstIsHidden) {
          if (firstImage.isConnected && !imagesToRemove.includes(firstImage)) {
            imagesToRemove.push(firstImage);
          }
          seenSignatures.set(signature, imgEl);
          seenUrls.add(normalizedUrl);
          if (normalizedSrcAttr) seenUrls.add(normalizedSrcAttr);
          return;
        } else if (currentIsHidden && !firstIsHidden) {
          isDuplicate = true;
        }
        else if (currentWidth !== null && firstWidth !== null && currentWidth <= firstWidth) {
          isDuplicate = true;
        } else if (currentWidth !== null && firstWidth !== null && currentWidth > firstWidth) {
          if (firstImage.isConnected && !imagesToRemove.includes(firstImage)) {
            imagesToRemove.push(firstImage);
          }
          seenSignatures.set(signature, imgEl);
          seenUrls.add(normalizedUrl);
          if (normalizedSrcAttr) seenUrls.add(normalizedSrcAttr);
          return;
        } else {
          isDuplicate = true;
        }
      }
    }
    
    if (isDuplicate) {
      imagesToRemove.push(imgEl);
    } else {
      seenUrls.add(normalizedUrl);
      if (normalizedSrcAttr) {
        seenUrls.add(normalizedSrcAttr);
      }
      if (signature) {
        seenSignatures.set(signature, imgEl);
      }
    }
  });
  
  imagesToRemove.forEach((img) => {
    if (!img.isConnected) {
      return;
    }
    
    try {
      const parent = img.parentElement;
      if (parent && parent.tagName === 'FIGURE') {
        parent.remove();
      } else {
        img.remove();
      }
    } catch {
      try {
        const parent = img.parentElement;
        if (parent) {
          parent.remove();
        }
      } catch {
        // Ignore
      }
    }
  });
}

/**
 * Removes duplicate text content
 */
function removeDuplicateTextContent(doc: Document): void {
  const seenTexts = new Map<string, Element>();
  const elementsToRemove: Element[] = [];
  
  const textContainers = doc.querySelectorAll('p, div, section, article > div, article > p');
  
  textContainers.forEach((elem) => {
    const text = elem.textContent?.trim() || '';
    
    if (text.length < 50) return;
    
    if (elem.closest('figure')) return;
    
    if (elem.tagName.match(/^H[1-6]$/)) return;
    
    const normalizedText = text.replace(/\s+/g, ' ').toLowerCase();
    
    if (seenTexts.has(normalizedText)) {
      const previous = seenTexts.get(normalizedText)!;
      
      const prevTag = previous.tagName;
      const prevClasses = previous.className || '';
      const currTag = elem.tagName;
      const currClasses = elem.className || '';
      
      if (prevTag === currTag && 
          (prevClasses === currClasses || 
           (prevClasses.length > 0 && currClasses.length > 0 && 
            prevClasses.split(' ').some(c => currClasses.includes(c))))) {
        elementsToRemove.push(elem);
      }
    } else {
      seenTexts.set(normalizedText, elem);
    }
  });
  
  elementsToRemove.forEach((elem) => {
    if (!elem.isConnected) {
      return;
    }
    
    try {
      elem.remove();
    } catch {
      // Ignore
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
 * Removes non-content elements (header, nav, footer, ads, widgets)
 */
function removeNonContentElements(doc: Document): void {
  const mainContent = doc.querySelector('main, article, [role="main"]');
  
  const adSelectors = [
    '[class*="ad"]',
    '[class*="advertisement"]',
    '[class*="publicite"]',
    '[class*="pub"]',
    '[id*="ad"]',
    '[data-format*="ad"]',
    '.fig-ad-content',
    '[data-figtag]',
    '.etx-player',
  ];
  
  adSelectors.forEach((selector) => {
    try {
      doc.querySelectorAll(selector).forEach((elem) => {
        if (!mainContent || !mainContent.contains(elem)) {
          elem.remove();
        }
      });
    } catch {
      // Ignore
    }
  });
  
  const widgetSelectors = [
    'button[class*="follow"]',
    '.fig-modal',
    '.fig-follow-button',
    '.fig-newsletter-box',
    '[data-module="fig-modal"]',
    '[data-module="fig-newsletter-box"]',
  ];
  
  widgetSelectors.forEach((selector) => {
    try {
      doc.querySelectorAll(selector).forEach((elem) => {
        if (!mainContent || !mainContent.contains(elem)) {
          elem.remove();
        }
      });
    } catch {
      // Ignore
    }
  });
  
  if (!mainContent) {
    doc.querySelectorAll('body > header, body > nav, body > footer').forEach((elem) => {
      elem.remove();
    });
    return;
  }
  
  const selectorsToClean = ['header', 'nav', 'footer'];
  
  selectorsToClean.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((elem) => {
      if (!mainContent.contains(elem)) {
        elem.remove();
      } else {
        if (elem.parentElement === mainContent && selector !== 'header') {
          elem.remove();
        }
      }
    });
  });
}

/**
 * Replaces placeholder images in processed content
 */
function replacePlaceholderImages(doc: Document, originalDoc: Document): void {
  const container = findArticleContainer(originalDoc);
  if (!container) return;
  
  const placeholderMap = new Map<string, string>();
  const originalImages = container.querySelectorAll('img');
  
  const maxImagesToProcess = 100;
  const imagesToProcess = Array.from(originalImages).slice(0, maxImagesToProcess);
  
  imagesToProcess.forEach((img) => {
    const srcAttr = img.getAttribute('src');
    const resolvedSrc = (img as HTMLImageElement).src;
    
    if ((srcAttr && isPlaceholderSrc(srcAttr)) || (resolvedSrc && isPlaceholderSrc(resolvedSrc))) {
      const realUrl = extractFromDataAttributes(img as HTMLImageElement);
      if (realUrl) {
        if (srcAttr) {
          placeholderMap.set(srcAttr, realUrl);
        }
        if (resolvedSrc) {
          placeholderMap.set(resolvedSrc, realUrl);
        }
        try {
          const urlObj = new URL(resolvedSrc || srcAttr || '');
          const normalized = urlObj.origin + urlObj.pathname;
          placeholderMap.set(normalized, realUrl);
        } catch {
          // Ignore
        }
      }
    }
  });
  
  const processedImages = doc.querySelectorAll('img');
  
  processedImages.forEach((img) => {
    const imgEl = img as HTMLImageElement;
    const currentSrc = imgEl.src || img.getAttribute('src') || '';
    
    if (isPlaceholderSrc(currentSrc)) {
      const replacement = placeholderMap.get(currentSrc);
      if (replacement) {
        imgEl.src = replacement;
        return;
      }
      
      try {
        const urlObj = new URL(currentSrc);
        const normalized = urlObj.origin + urlObj.pathname;
        const replacementNormalized = placeholderMap.get(normalized);
        if (replacementNormalized) {
          imgEl.src = replacementNormalized;
          return;
        }
      } catch {
        // Ignore
      }
      
      ensureImageSrc(imgEl);
    }
  });
}

/**
 * Post-processes extracted HTML to recover images and embeds
 */
function postProcessContent(content: string, title: string, originalImages: HTMLImageElement[], originalDoc: Document): string {
  const parser = new DOMParser();
  let doc = parser.parseFromString(content, 'text/html');
  
  const bodyText = doc.body && doc.body.childNodes.length === 1 && doc.body.firstChild?.nodeType === 3
    ? (doc.body.firstChild.textContent || '')
    : '';
    
  if (bodyText.startsWith('<') && /<\/?[a-zA-Z]/.test(bodyText)) {
    try {
      doc = parser.parseFromString(bodyText, 'text/html');
    } catch {
      // Ignore
    }
  }

  removeAsides(doc);
  
  const isReadabilityOutput = doc.querySelector('#readability-page-1');
  const hasMainOrArticle = doc.querySelector('main, article, section, [role="main"]');
  
  if (!isReadabilityOutput && !hasMainOrArticle) {
    removeNonContentElements(doc);
  }

  fixNoscriptImages(doc);
  
  replacePlaceholderImages(doc, originalDoc);
  
  doc.querySelectorAll('img').forEach((img) => {
    ensureImageSrc(img as HTMLImageElement);
  });
  
  mergeOriginalImages(doc, originalImages);
  
  filterSmallImages(doc);
  
  removeDuplicateImages(doc);
  
  removeDuplicateTextContent(doc);
  
  fixLazyIframes(doc);
  
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
 */
export function extractArticle(
  html: string,
  options: ExtractOptions = {}
): ArticleContent | null {
  const { url = '', minTextLength = 250 } = options;

  const doc = parseHTML(html);

  setBaseURL(doc, url);

  const documentClone = doc.cloneNode(true) as Document;

  removeAsides(documentClone);

  const reader = new Readability(documentClone, {
    maxElemsToParse: 0,
    nbTopCandidates: 5,
    charThreshold: 500,
    keepClasses: false,
  });

  const article = reader.parse();

  if (!article || !article.content) {
    const articleElement = doc.querySelector('article');
    if (articleElement) {
      const contentSelectors = ['.post-content', '.entry-content', '.article-content', '.content', '[class*="content"]'];
      let postContent: Element | null = null;
      
      for (const selector of contentSelectors) {
        postContent = articleElement.querySelector(selector);
        if (postContent) {
          break;
        }
      }
      
      if (!postContent) {
        postContent = articleElement;
      }
      
      if (postContent) {
        const contentClone = postContent.cloneNode(true) as Element;
        
        contentClone.querySelectorAll('.share-section, .share-wrap, .nextprev-section, .comments-section, aside').forEach(el => {
          el.remove();
        });
        
        const content = contentClone.innerHTML;
        const textLength = contentClone.textContent?.trim().length || 0;
        
        if (textLength >= minTextLength) {
          const titleElement = articleElement.querySelector('h1, .post-title, .entry-title, .article-title');
          const rawTitle = titleElement?.textContent?.trim() || tryExtractTitleFromSelectors(doc) || 'Untitled';
          const title = decodeHtmlEntities(rawTitle);
          
          return {
            title,
            byline: null,
            content: content,
            textContent: contentClone.textContent || '',
            length: textLength,
            excerpt: '',
            siteName: null,
          };
        }
      }
    }
    
    return null;
  }

  const title = extractTitle(doc, article.title);
  
  let finalTitle = title;
  if (!finalTitle || finalTitle.trim().length === 0) {
    const contentDoc = new DOMParser().parseFromString(article.content, 'text/html');
    const contentTitle = tryExtractTitleFromSelectors(contentDoc);
    if (contentTitle) {
      finalTitle = contentTitle;
    }
  }
  
  if (!finalTitle || finalTitle.trim().length === 0) {
    return null;
  }

  if ((article.length ?? 0) < minTextLength) {
    return null;
  }

  const originalImages = collectOriginalImages(doc, article.content);

  let processedContent = article.content;
  try {
    processedContent = postProcessContent(article.content, finalTitle, originalImages, doc);
  } catch {
    // Non-fatal
  }

  return {
    title: finalTitle,
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
  if (!html || html.length < 500) {
    return false;
  }

  const hasArticleTag = /<article/i.test(html);
  const hasMainTag = /<main/i.test(html);
  const hasParagraphs = (html.match(/<p/gi) || []).length > 3;

  return hasArticleTag || hasMainTag || hasParagraphs;
}
