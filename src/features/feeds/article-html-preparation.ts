/**
 * Prepares HTML for Shadow DOM injection by extracting scripts and stylesheets
 * and removing dangerous event handlers for security.
 */
export function prepareHtmlForShadowDom(html: string): { 
    html: string; 
    scripts: string[]; 
    externalScripts: string[]; 
    externalStylesheets: string[] 
} {
    // Create a temporary DOM to parse and prepare the HTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // Remove event handlers from elements (onclick, onload, etc.) for security
    const allElements = doc.querySelectorAll('*')
    allElements.forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name)
            }
        })
    })
    
    // Extract scripts separately (we'll execute them manually with document proxy)
    const extractedScripts: string[] = []
    const extractedExternalScripts: string[] = []
    const extractedExternalStylesheets: string[] = []
    const allScripts = doc.querySelectorAll('script')
    allScripts.forEach(script => {
        const scriptSrc = script.getAttribute('src')
        const scriptContent = script.textContent || ''
        
        // Handle external scripts (with src attribute)
        if (scriptSrc) {
            // Remove scripts that try to access parent window (security risk)
            // But allow Twitter widgets and other common embeds
            if (scriptSrc.includes('window.parent') || 
                scriptSrc.includes('parent.postMessage') ||
                scriptSrc.includes('top.location')) {
                script.remove()
                return
            }
            // Keep external script URLs for loading
            extractedExternalScripts.push(scriptSrc)
            script.remove()
            return
        }
        
        // Handle inline scripts
        // Remove scripts that try to access parent window (security risk)
        if (scriptContent.includes('window.parent') || 
            scriptContent.includes('parent.postMessage') ||
            scriptContent.includes('top.location') ||
            scriptContent.includes('window.top')) {
            script.remove()
            return
        }
        
        // Keep script content for manual execution
        if (scriptContent.trim()) {
            extractedScripts.push(scriptContent)
        }
        script.remove() // Remove from DOM so they don't execute automatically
    })
    
    // Extract external stylesheets (we'll load them in Shadow DOM for isolation)
    const allStylesheets = doc.head.querySelectorAll('link[rel="stylesheet"]')
    allStylesheets.forEach(link => {
        const href = link.getAttribute('href')
        if (href && !href.startsWith('data:') && !href.startsWith('blob:')) {
            extractedExternalStylesheets.push(href)
            link.remove()
        }
    })
    
    // Get inline styles from head (they'll be isolated automatically by Shadow DOM)
    const inlineStyles = Array.from(doc.head.querySelectorAll('style'))
        .map(el => el.outerHTML)
        .join('\n')
    
    // Get body content (without scripts)
    const bodyContent = doc.body?.innerHTML || ''
    
    // Combine inline styles and body content
    // External stylesheets will be loaded separately in Shadow DOM for isolation
    // Shadow DOM will automatically isolate all styles (inline and external)
    // Return HTML, inline scripts, external scripts, and external stylesheets
    return {
        html: inlineStyles + '\n' + bodyContent,
        scripts: extractedScripts,
        externalScripts: extractedExternalScripts,
        externalStylesheets: extractedExternalStylesheets
    }
}

