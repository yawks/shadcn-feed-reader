/**
 * Tweet embedding utility
 *
 * Detects tweet containers (divs with data-tweetid attribute) in HTML content
 * and transforms them into proper Twitter/X embed code that will be rendered
 * by the Twitter widget.js script.
 */

/**
 * Transforms tweet placeholder divs into Twitter embed blockquotes
 * that can be rendered by the Twitter widget.
 *
 * @param html - The HTML content to process
 * @returns The HTML with tweet placeholders converted to embeds
 */
export function transformTweetEmbeds(html: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Find all elements with data-tweetid attribute
    const tweetContainers = doc.querySelectorAll('[data-tweetid]')

    tweetContainers.forEach((container) => {
        const tweetId = container.getAttribute('data-tweetid')
        if (!tweetId) return

        // Create Twitter embed blockquote
        const blockquote = doc.createElement('blockquote')
        blockquote.className = 'twitter-tweet'
        blockquote.setAttribute('data-dnt', 'true') // Do not track

        // Create the tweet link (required by Twitter widget)
        const link = doc.createElement('a')
        link.href = `https://twitter.com/x/status/${tweetId}`
        link.textContent = 'Loading tweet...'
        blockquote.appendChild(link)

        // Replace the original container with the blockquote
        container.parentNode?.replaceChild(blockquote, container)
    })

    return doc.body.innerHTML
}

/**
 * Generates the Twitter widget script tag with theme support
 *
 * @param theme - 'dark' or 'light' theme
 * @returns Script tag HTML string to include in the document
 */
export function getTwitterWidgetScript(theme: 'dark' | 'light'): string {
    // The Twitter widget script will automatically find and render
    // all blockquote.twitter-tweet elements on the page
    return `
    <script>
        (function() {
            // Set theme for Twitter widgets
            window.twttr = window.twttr || {};
            window.twttr.widgets = window.twttr.widgets || {};

            // Load Twitter widget script
            var script = document.createElement('script');
            script.src = 'https://platform.twitter.com/widgets.js';
            script.async = true;
            script.charset = 'utf-8';

            script.onload = function() {
                // Once loaded, render all tweets with the correct theme
                if (window.twttr && window.twttr.widgets && window.twttr.widgets.load) {
                    window.twttr.widgets.load();
                }
            };

            document.head.appendChild(script);

            // Apply theme to existing and future twitter-tweet blockquotes
            function applyTheme() {
                var tweets = document.querySelectorAll('blockquote.twitter-tweet');
                tweets.forEach(function(tweet) {
                    tweet.setAttribute('data-theme', '${theme}');
                });
            }

            // Apply theme immediately
            applyTheme();

            // Also apply when DOM changes (for dynamically added tweets)
            var observer = new MutationObserver(function(mutations) {
                applyTheme();
            });

            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', function() {
                    applyTheme();
                    observer.observe(document.body, { childList: true, subtree: true });
                });
            }
        })();
    </script>
    `
}

/**
 * Checks if the HTML content contains any tweet embeds
 *
 * @param html - The HTML content to check
 * @returns true if tweets are found
 */
export function hasTweetEmbeds(html: string): boolean {
    return /data-tweetid/i.test(html)
}
