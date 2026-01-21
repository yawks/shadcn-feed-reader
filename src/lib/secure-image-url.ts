/**
 * Secure image URL utility
 * Converts HTTP URLs to HTTPS to avoid mixed content errors
 */

/**
 * Secures an image URL by converting HTTP to HTTPS
 * @param url The image URL (may be HTTP or HTTPS)
 * @returns A secure URL (HTTPS)
 */
export function secureImageUrl(url: string | null | undefined): string {
  if (!url) {
    return '/images/feed_icon.png'
  }

  // If it's already a data URL, local path, or HTTPS, return as-is
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('/') ||
    url.startsWith('https://') ||
    url.startsWith('http://localhost') ||
    url.startsWith('http://127.0.0.1')
  ) {
    return url
  }

  // If it's HTTP, convert to HTTPS
  if (url.startsWith('http://')) {
    // Try to convert HTTP to HTTPS
    const httpsUrl = url.replace('http://', 'https://')
    
    // On Android, we might need to use a proxy for cleartext images
    // For now, just convert to HTTPS - if it fails, the onError handler will catch it
    return httpsUrl
  }

  return url
}

/**
 * Gets a secure image URL, with fallback handling
 * @param url The image URL
 * @param fallback The fallback URL if the image fails to load
 * @returns A secure URL
 */
export function getSecureImageUrl(url: string | null | undefined, fallback: string = '/images/feed_icon.png'): string {
  const secured = secureImageUrl(url)
  return secured || fallback
}

