/**
 * Lazy-loaded image fix utility
 *
 * Detects images with lazy-loading attributes (data-src, data-lazy-src, etc.)
 * and copies the real URL to the src attribute so images display correctly.
 */

/**
 * Common lazy-loading data attributes used by various libraries and frameworks
 */
const LAZY_LOAD_ATTRIBUTES = [
    // Standard lazy loading
    'data-src',
    'data-lazy-src',
    'data-lazy',

    // WordPress and plugins
    'data-original',
    'data-orig-file',
    'data-large-file',
    'data-medium-file',

    // Various JS libraries
    'data-actualsrc',
    'data-real-src',
    'data-delayed-src',
    'data-lazyload',
    'data-lazyload-src',
    'data-ll-src',

    // Specific frameworks
    'data-src-retina',
    'data-hi-res-src',
    'data-full-src',
    'data-image',
    'data-image-src',

    // Other common patterns
    'data-url',
    'data-pagespeed-lazy-src',
    'data-echo',
    'data-unveil',
    'data-bg', // Sometimes used for background images in img tags
]

/**
 * Checks if a string looks like a valid image URL
 */
function isValidImageUrl(url: string): boolean {
    if (!url || url.length < 10) return false
    const trimmed = url.trim()

    // Must start with http, https, or //
    if (!trimmed.startsWith('http://') &&
        !trimmed.startsWith('https://') &&
        !trimmed.startsWith('//')) {
        return false
    }

    // Should not be a data URL or blob
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return false
    }

    return true
}

/**
 * Checks if the current src is a placeholder or invalid
 */
function isPlaceholderOrInvalid(src: string | null): boolean {
    if (!src) return true

    const trimmed = src.trim().toLowerCase()

    // Empty or too short
    if (trimmed.length < 10) return true

    // Data URI (often used as placeholder)
    if (trimmed.startsWith('data:')) return true

    // Common placeholder patterns
    const placeholderPatterns = [
        'placeholder',
        'blank',
        'spacer',
        'transparent',
        'loading',
        'lazy',
        '1x1',
        'pixel',
        'grey.gif',
        'gray.gif',
        'empty',
        'default',
    ]

    for (const pattern of placeholderPatterns) {
        if (trimmed.includes(pattern)) return true
    }

    // Very small images (often tracking pixels)
    if (/\/1x1\.|\/1\.gif|\/pixel\./i.test(trimmed)) return true

    return false
}

/**
 * Extracts the best image URL from lazy-loading attributes
 */
function extractLazyUrl(img: Element): string | null {
    for (const attr of LAZY_LOAD_ATTRIBUTES) {
        const value = img.getAttribute(attr)
        if (value && isValidImageUrl(value)) {
            return value.trim()
        }
    }

    // Also check srcset and data-srcset for lazy loaded srcsets
    const srcset = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset')
    if (srcset) {
        // Extract the largest/last source from srcset
        const sources = srcset.split(',').map(s => s.trim()).filter(Boolean)
        if (sources.length > 0) {
            const lastSource = sources[sources.length - 1]
            const url = lastSource.split(/\s+/)[0]
            if (url && isValidImageUrl(url)) {
                return url.trim()
            }
        }
    }

    return null
}

/**
 * Fixes lazy-loaded images in HTML content by copying data-src (and similar)
 * attributes to the src attribute.
 *
 * @param html - The HTML content to process
 * @returns The HTML with lazy-loaded images fixed
 */
export function fixLazyLoadedImages(html: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    let modified = false

    doc.querySelectorAll('img').forEach((img) => {
        const currentSrc = img.getAttribute('src')

        // Check if current src is missing or is a placeholder
        if (isPlaceholderOrInvalid(currentSrc)) {
            const lazyUrl = extractLazyUrl(img)
            if (lazyUrl) {
                img.setAttribute('src', lazyUrl)
                modified = true
            }
        }

        // Also fix srcset if it's empty but data-srcset exists
        const currentSrcset = img.getAttribute('srcset')
        if (!currentSrcset || currentSrcset.trim().length === 0) {
            const lazySrcset = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset')
            if (lazySrcset && lazySrcset.trim().length > 0) {
                img.setAttribute('srcset', lazySrcset)
                modified = true
            }
        }
    })

    // Return original if no modifications were made (avoid unnecessary parsing)
    return modified ? doc.body.innerHTML : html
}

/**
 * Checks if the HTML content likely has lazy-loaded images that need fixing
 *
 * @param html - The HTML content to check
 * @returns true if lazy-loaded images are detected
 */
export function hasLazyLoadedImages(html: string): boolean {
    // Quick regex check before parsing
    for (const attr of LAZY_LOAD_ATTRIBUTES) {
        if (html.includes(attr + '="') || html.includes(attr + "='")) {
            return true
        }
    }
    return false
}
