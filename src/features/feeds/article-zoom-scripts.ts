/**
 * Zoom script for iframe-based article views (readability mode)
 * Uses native browser pinch-to-zoom instead of custom implementation
 */
export function getIframeZoomScript(): string {
  return `
        (function() {
            console.log('[ZOOM] Iframe: Native zoom enabled');

            // Ensure proper styles for native zoom to work
            const style = document.createElement('style');
            style.textContent = \`
                html, body {
                    /* Allow native touch zoom - use manipulation for better Android compatibility */
                    touch-action: manipulation;
                    /* Ensure content is scrollable */
                    overflow: auto;
                    /* Prevent body::after from adding extra space */
                }
                body::after {
                    content: "";
                    display: block;
                    height: 0 !important;
                }
                /* Ensure images don't overflow */
                img, video, iframe, embed, object {
                    max-width: 100%;
                    height: auto;
                }
            \`;
            document.head.appendChild(style);
        })();
    `
}

/**
 * Zoom script for Shadow DOM-based article views (original mode)
 * Uses native browser pinch-to-zoom instead of custom implementation
 */
export function getShadowDomZoomScript(): string {
  return `
        (function() {
            console.log('[ZOOM] Shadow DOM: Native zoom enabled');

            // Ensure proper styles for native zoom to work
            const style = document.createElement('style');
            style.textContent = \`
                html, body {
                    /* Allow native touch zoom - use manipulation for better Android compatibility */
                    touch-action: manipulation;
                    /* Ensure content is scrollable */
                    overflow: auto;
                    /* Prevent horizontal overflow */
                    max-width: 100%;
                }
                body::after {
                    content: "";
                    display: block;
                    height: 0 !important;
                }
                /* Constrain content to prevent horizontal scroll */
                * {
                    max-width: 100%;
                    box-sizing: border-box;
                }
                img, video, iframe, embed, object {
                    max-width: 100%;
                    height: auto;
                }
                table {
                    max-width: 100%;
                    table-layout: auto;
                    word-wrap: break-word;
                }
                pre, code {
                    max-width: 100%;
                    overflow-x: auto;
                    word-wrap: break-word;
                }
            \`;
            document.head.appendChild(style);
        })();
    `
}
