use crate::ProxyState;
use axum::{
    body::{to_bytes, Body},
    extract::{Path, Query, State},
    http::{header, StatusCode, Uri},
    response::Response,
    routing::get,
    Router,
    middleware::{self, Next},
};
use tauri::http::Request;
use lol_html::{element, HtmlRewriter, Settings};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use std::collections::HashMap;
use url::Url;

// Middleware to log all incoming requests
async fn log_requests(uri: Uri, req: axum::http::Request<Body>, next: Next) -> Response {
    println!("🌐 PROXY REQUEST: {} {}", req.method(), uri);
    next.run(req).await
}

// The listener script that will be injected to handle communication.
// It posts the fully rendered HTML back to the parent window via postMessage.
// The parent can then run Readability on that HTML (which includes JS-rendered content).
const LISTENER_SCRIPT: &str = r#"
<script>

    (function(){
        // Always allow posting messages to parent even if cross-origin
        // (postMessage doesn't require same-origin). We keep a flag in case
        // future logic needs to avoid parent access.
        let canAccessParent = !!(window.parent && window.parent !== window);

        // Intercept fullscreen errors and relay to parent for nested iframes (e.g., Twitter)
        // Since we can't intercept errors from cross-origin iframes directly,
        // we use multiple strategies: fullscreenerror events, unhandledrejection, and console.error proxy
        (function() {
            let fullscreenRequested = false;
            
            function relayFullscreenRequest() {
                if (!fullscreenRequested && canAccessParent) {
                    fullscreenRequested = true;
                    console.log('[Proxy] Relaying fullscreen request to parent');
                    window.parent.postMessage({ 
                        type: 'TWITTER_FULLSCREEN_REQUEST' 
                    }, '*');
                    // Reset flag after 2 seconds
                    setTimeout(function() {
                        fullscreenRequested = false;
                    }, 2000);
                }
            }
            
            // Listen for fullscreenerror events
            document.addEventListener('fullscreenerror', function(e) {
                console.log('[Proxy] Fullscreen error event caught');
                relayFullscreenRequest();
            });
            
            // Listen for unhandled promise rejections (Twitter might use promises)
            window.addEventListener('unhandledrejection', function(e) {
                const reason = e.reason;
                const errorMsg = reason && reason.message ? reason.message : String(reason);
                if (errorMsg.includes('InvalidStateError') || 
                    (errorMsg.includes('fullscreen') && errorMsg.includes('embed'))) {
                    console.log('[Proxy] Unhandled rejection related to fullscreen:', errorMsg);
                    relayFullscreenRequest();
                }
            });
            
            // Proxy console.error to catch errors logged by Twitter
            const originalConsoleError = console.error;
            console.error = function(...args) {
                originalConsoleError.apply(console, args);
                const errorStr = args.join(' ');
                if (errorStr.includes('InvalidStateError') && 
                    (errorStr.includes('embed') || errorStr.includes('twitter'))) {
                    console.log('[Proxy] Console error detected related to fullscreen:', errorStr);
                    relayFullscreenRequest();
                }
            };
            
            // Also proxy window.onerror (though it may not catch cross-origin errors)
            const originalOnError = window.onerror;
            window.onerror = function(message, source, lineno, colno, error) {
                if (originalOnError) {
                    originalOnError.call(this, message, source, lineno, colno, error);
                }
                if (message && (message.includes('InvalidStateError') || 
                    (message.includes('fullscreen') && (source && source.includes('embed'))))) {
                    console.log('[Proxy] Window error detected related to fullscreen:', message);
                    relayFullscreenRequest();
                }
                return false; // Don't prevent default error handling
            };
        })();


        // Helper to scroll through the page to trigger lazy-loaded content
        function scrollToRevealContent() {
            return new Promise((resolve) => {
                let scrolls = 0;
                const maxScrolls = 15;
                const scrollDelay = 200;
                
                function doScroll() {
                    scrolls++;
                    const currentHeight = document.documentElement.scrollHeight;
                    const viewportHeight = window.innerHeight;
                    const scrollPosition = window.scrollY + viewportHeight;
                    
                    // Scroll down by viewport height
                    window.scrollTo(0, scrollPosition);
                    
                    // Check if we've reached the bottom or max scrolls
                    if (scrollPosition >= currentHeight || scrolls >= maxScrolls) {
                        // Scroll back to top when done
                        window.scrollTo(0, 0);
                        resolve();
                    } else {
                        setTimeout(doScroll, scrollDelay);
                    }
                }
                
                doScroll();
            });
        }

        // Helper to send the rendered HTML back to the parent window.
        function sendRenderedHTML() {
            
            try {
                const html = document.documentElement.outerHTML;
                // send as a message; parent should verify origin/source
                window.parent.postMessage({ type: 'RENDERED_HTML', html: html }, '*');
            } catch (e) {
                // ignore
            }
        }

        // When the page finishes loading, scroll through it to reveal lazy content, then send.
        window.addEventListener('load', function() {
            // Allow initial page scripts to run
            setTimeout(async function() {
                try {
                    await scrollToRevealContent();
                    // Give a moment for any final lazy-loaded content to settle
                    setTimeout(sendRenderedHTML, 800);
                } catch (e) {
                    // If scrolling fails, send anyway
                    sendRenderedHTML();
                }
            }, 500);
        });

        // Also observe DOM mutations and send after a short quiet period.
        try {
            let renderTimer = null;
            const mo = new MutationObserver(() => {
                if (renderTimer) clearTimeout(renderTimer);
                renderTimer = setTimeout(sendRenderedHTML, 800);
            });
            mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        } catch (e) {
            // ignore if MutationObserver not available
        }

        // Allow parent to request an immediate snapshot
        window.addEventListener('message', (event) => {
            try {
                const { action } = event.data || {};
                if (action === 'REQUEST_RENDERED') {
                    // Scroll first, then send
                    scrollToRevealContent().then(() => {
                        setTimeout(sendRenderedHTML, 500);
                    }).catch(() => {
                        sendRenderedHTML();
                    });
                }
            } catch (e) {}
        });

        // Detect videos in the page and notify parent
        function detectVideos() {
            try {
                const videos = document.querySelectorAll('video');
                console.log('[Proxy Injected Script] Found videos:', videos.length);
                
                if (videos.length > 0) {
                    const video = videos[0];
                    const source = video.querySelector('source');
                    const videoUrl = (source && source.src) || video.src || video.currentSrc;
                    
                    if (videoUrl) {
                        console.log('[Proxy Injected Script] Detected video URL:', videoUrl);
                        window.parent.postMessage({
                            type: 'VIDEO_DETECTED',
                            url: videoUrl
                        }, '*');
                    }
                }
            } catch (e) {
                console.error('[Proxy Injected Script] Error detecting videos:', e);
            }
        }

        // Style for per-video overlay button
        function ensureOverlayStyles() {
            if (document.getElementById('__proxy_video_styles__')) return;
            const style = document.createElement('style');
            style.id = '__proxy_video_styles__';
            style.textContent = `
                .__proxy_video_actions__{display:flex;gap:8px;margin-top:8px;}
                .__proxy_embed_wrapper__{position:relative;display:inline-block;width:100%;}
                .__proxy_btn__{background:rgba(0,0,0,0.7);color:#fff;border:2px solid rgba(255,255,255,0.8);border-radius:6px;padding:6px 10px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;pointer-events:auto;z-index:2147483647;}
                .__proxy_btn__:hover{background:rgba(0,0,0,0.9);}
            `;
            document.head.appendChild(style);
        }

        // Add overlay FS button on each <video> and embedded iframes
        function installVideoOverlays() {
            try {
                ensureOverlayStyles();
                
                // Handle videos
                const videos = document.querySelectorAll('video');
                videos.forEach((video) => {
                    if (video.dataset.__proxyOverlayInstalled__) return;
                    video.dataset.__proxyOverlayInstalled__ = 'true';

                    if (!video.hasAttribute('controls')) video.setAttribute('controls', 'controls');

                    // Insert actions directly after video (no wrapper to avoid layout shifts)
                    const actions = document.createElement('div');
                    actions.className='__proxy_video_actions__';

                    const fsBtn = document.createElement('button');
                    fsBtn.className='__proxy_btn__';
                    fsBtn.textContent='⤢ Fullscreen';
                    fsBtn.addEventListener('click', function(e){
                        e.preventDefault(); e.stopPropagation();
                        try { if (video && video.pause) video.pause(); } catch(_p) {}
                        let ct = 0; try { ct = (video && typeof video.currentTime === 'number') ? video.currentTime : 0; } catch(_e) { ct = 0; }
                        const source = video.querySelector('source');
                        const videoUrl = (source && source.src) || video.src || video.currentSrc || '';
                        
                        // Try direct fullscreen first (simpler, works if same-origin)
                        if (video.requestFullscreen) {
                            video.requestFullscreen().catch(function(err) {
                                // If direct fullscreen fails, use modal player
                                if (videoUrl) {
                                    window.parent.postMessage({ type: 'OPEN_VIDEO', url: videoUrl, currentTime: ct }, '*');
                                }
                            });
                        } else if (video.webkitRequestFullscreen) {
                            video.webkitRequestFullscreen();
                        } else if (videoUrl) {
                            // Fallback to modal player
                            window.parent.postMessage({ type: 'OPEN_VIDEO', url: videoUrl, currentTime: ct }, '*');
                        }
                    });
                    actions.appendChild(fsBtn);

                    // Insert actions directly after video element
                    if (video.parentNode) {
                        video.parentNode.insertBefore(actions, video.nextSibling);
                    }

                    video.addEventListener('dblclick', function(e){
                        e.preventDefault(); e.stopPropagation();
                        // Try direct fullscreen
                        if (video.requestFullscreen) {
                            video.requestFullscreen().catch(function() {
                                // Fallback to parent iframe fullscreen
                                window.parent.postMessage({ type: 'TOGGLE_FULLSCREEN' }, '*');
                            });
                        } else if (video.webkitRequestFullscreen) {
                            video.webkitRequestFullscreen();
                        } else {
                            window.parent.postMessage({ type: 'TOGGLE_FULLSCREEN' }, '*');
                        }
                    }, { capture: true });
                });
                
                // Handle embedded iframes (Twitter, YouTube, etc.)
                // Collect all iframes to avoid duplicates (Twitter embeds can be in blockquotes)
                const processedIframes = new Set();
                
                // First, find iframes in Twitter blockquotes
                const twitterBlockquotes = document.querySelectorAll('blockquote.twitter-tweet, .twitter-tweet, blockquote[class*="twitter"], div[class*="twitter"]');
                twitterBlockquotes.forEach((blockquote) => {
                    const iframe = blockquote.querySelector('iframe');
                    if (iframe) {
                        processedIframes.add(iframe);
                        blockquote.dataset.__proxyFullscreenInstalled__ = 'true';
                    }
                });
                
                // Then find all other embed iframes
                const allEmbeds = document.querySelectorAll('iframe[src*="twitter"], iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="dailymotion"], iframe[src*="instagram"], iframe[src*="tiktok"]');
                allEmbeds.forEach((iframe) => {
                    if (processedIframes.has(iframe)) return;
                    processedIframes.add(iframe);
                });
                
                // Process all collected iframes
                processedIframes.forEach((iframe) => {
                    if (iframe.dataset.__proxyFullscreenInstalled__) return;
                    iframe.dataset.__proxyFullscreenInstalled__ = 'true';
                    
                    // Check if this is a Twitter iframe
                    const isTwitter = iframe.src && iframe.src.includes('platform.twitter.com');
                    
                    // Ensure iframe can go fullscreen (essential for native controls)
                    iframe.setAttribute('allowfullscreen', '');
                    iframe.setAttribute('webkitallowfullscreen', '');
                    iframe.setAttribute('mozallowfullscreen', '');
                    iframe.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture');
                    
                    // For Twitter: add a custom fullscreen button since native button fails due to nested iframe restrictions
                    // The native Twitter fullscreen button tries to fullscreen from within a cross-origin iframe,
                    // which fails with InvalidStateError due to browser security restrictions
                    if (isTwitter) {
                        console.log('[Proxy] Twitter embed detected, adding custom fullscreen button');
                        
                        // Find or create container
                        let container = iframe.parentElement;
                        let needsWrapper = true;
                        
                        // Check if already in a suitable container (blockquote for Twitter)
                        while (container && container !== document.body) {
                            if (container.tagName === 'BLOCKQUOTE' ||
                                container.classList.contains('twitter-tweet')) {
                                needsWrapper = false;
                                if (window.getComputedStyle(container).position === 'static') {
                                    container.style.position = 'relative';
                                }
                                break;
                            }
                            if (container.classList.contains('__proxy_twitter_wrapper__')) {
                                needsWrapper = false;
                                break;
                            }
                            container = container.parentElement;
                        }
                        
                        if (needsWrapper) {
                            container = document.createElement('div');
                            container.className = '__proxy_twitter_wrapper__';
                            container.style.position = 'relative';
                            container.style.display = 'inline-block';
                            iframe.parentNode.insertBefore(container, iframe);
                            container.appendChild(iframe);
                        }
                        
                        // Add fullscreen button if not already present
                        if (!container.querySelector('.__proxy_twitter_fs_btn__')) {
                            const fsBtn = document.createElement('button');
                            fsBtn.className = '__proxy_twitter_fs_btn__';
                            fsBtn.innerHTML = '⤢';
                            fsBtn.setAttribute('aria-label', 'Fullscreen');
                            fsBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10000;pointer-events:auto;cursor:pointer;background:rgba(29,161,242,0.85);color:white;border:none;padding:6px 10px;border-radius:4px;font-size:14px;font-weight:bold;line-height:1;box-shadow:0 2px 4px rgba(0,0,0,0.2);transition:background 0.2s;';
                            fsBtn.addEventListener('mouseenter', function() {
                                this.style.background = 'rgba(29,161,242,1)';
                            });
                            fsBtn.addEventListener('mouseleave', function() {
                                this.style.background = 'rgba(29,161,242,0.85)';
                            });
                            fsBtn.addEventListener('click', function(e){
                                e.preventDefault(); 
                                e.stopPropagation();
                                console.log('[Proxy] Twitter custom fullscreen button clicked');
                                window.parent.postMessage({ 
                                    type: 'TWITTER_FULLSCREEN_REQUEST' 
                                }, '*');
                            });
                            container.appendChild(fsBtn);
                        }
                        
                        return; // Skip the generic embed button logic below
                    }
                    
                    // For other embeds (YouTube, Vimeo, etc.): add our button
                    // Find container (may be a blockquote or need a wrapper)
                    let container = iframe.parentElement;
                    let needsWrapper = true;
                    
                    // Check if already in a suitable container (blockquote for Twitter)
                    while (container && container !== document.body) {
                        if (container.tagName === 'BLOCKQUOTE' ||
                            container.classList.contains('twitter-tweet')) {
                            needsWrapper = false;
                            // Ensure it's positioned relatively for button positioning
                            if (window.getComputedStyle(container).position === 'static') {
                                container.style.position = 'relative';
                            }
                            break;
                        }
                        if (container.classList.contains('__proxy_embed_wrapper__')) {
                            needsWrapper = false;
                            break;
                        }
                        container = container.parentElement;
                    }
                    
                    if (needsWrapper) {
                        container = document.createElement('div');
                        container.className = '__proxy_embed_wrapper__';
                        container.style.position = 'relative';
                        container.style.display = 'inline-block';
                        iframe.parentNode.insertBefore(container, iframe);
                        container.appendChild(iframe);
                    }
                    
                    // Add fullscreen button if not already present (only for non-Twitter embeds)
                    if (!container.querySelector('.__proxy_embed_btn__')) {
                        const fsBtn = document.createElement('button');
                        fsBtn.className = '__proxy_embed_btn__';
                        fsBtn.textContent = '⤢ Fullscreen';
                        fsBtn.style.position = 'absolute';
                        fsBtn.style.bottom = '8px';
                        fsBtn.style.right = '8px';
                        fsBtn.style.zIndex = '10000';
                        fsBtn.style.pointerEvents = 'auto';
                        fsBtn.style.cursor = 'pointer';
                        fsBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        fsBtn.style.color = 'white';
                        fsBtn.style.border = 'none';
                        fsBtn.style.padding = '6px 12px';
                        fsBtn.style.borderRadius = '4px';
                        fsBtn.style.fontSize = '12px';
                        fsBtn.addEventListener('click', function(e){
                            e.preventDefault(); 
                            e.stopPropagation();
                            console.log('[Proxy] Fullscreen button clicked for embed');
                            
                            // Get iframe URL (may be null for cross-origin, but we try)
                            const iframeUrl = iframe.src || iframe.getAttribute('src') || '';
                            console.log('[Proxy] Iframe URL:', iframeUrl);
                            
                            // Try direct fullscreen first (for same-origin iframes)
                            let fullscreenAttempted = false;
                            if (iframe.requestFullscreen) {
                                fullscreenAttempted = true;
                                iframe.requestFullscreen().then(function() {
                                    console.log('[Proxy] Iframe fullscreen successful');
                                }).catch(function(err) {
                                    console.log('[Proxy] Iframe fullscreen failed:', err);
                                    // Fallback: try container
                                    if (container.requestFullscreen) {
                                        container.requestFullscreen().then(function() {
                                            console.log('[Proxy] Container fullscreen successful');
                                        }).catch(function(err2) {
                                            console.log('[Proxy] Container fullscreen failed:', err2);
                                            // Final fallback: use postMessage with iframe URL
                                            console.log('[Proxy] Using postMessage fallback with URL:', iframeUrl);
                                            window.parent.postMessage({ 
                                                type: 'TOGGLE_FULLSCREEN',
                                                url: iframeUrl || undefined
                                            }, '*');
                                        });
                                    } else {
                                        console.log('[Proxy] No container fullscreen, using postMessage with URL:', iframeUrl);
                                        window.parent.postMessage({ 
                                            type: 'TOGGLE_FULLSCREEN',
                                            url: iframeUrl || undefined
                                        }, '*');
                                    }
                                });
                            } else if (iframe.webkitRequestFullscreen) {
                                fullscreenAttempted = true;
                                iframe.webkitRequestFullscreen();
                            } else if (container.requestFullscreen) {
                                fullscreenAttempted = true;
                                container.requestFullscreen().catch(function(err) {
                                    console.log('[Proxy] Container fullscreen failed:', err);
                                    window.parent.postMessage({ 
                                        type: 'TOGGLE_FULLSCREEN',
                                        url: iframeUrl || undefined
                                    }, '*');
                                });
                            }
                            
                            // If no fullscreen API available, use postMessage
                            if (!fullscreenAttempted) {
                                console.log('[Proxy] No fullscreen API, using postMessage with URL:', iframeUrl);
                                window.parent.postMessage({ 
                                    type: 'TOGGLE_FULLSCREEN',
                                    url: iframeUrl || undefined
                                }, '*');
                            }
                        });
                        container.appendChild(fsBtn);
                    }
                    
                    // Double-click to fullscreen
                    iframe.addEventListener('dblclick', function(e){
                        e.preventDefault(); 
                        e.stopPropagation();
                        console.log('[Proxy] Double-click on embed');
                        if (iframe.requestFullscreen) {
                            iframe.requestFullscreen().catch(function() {
                                if (container.requestFullscreen) {
                                    container.requestFullscreen().catch(function() {
                                        window.parent.postMessage({ type: 'TOGGLE_FULLSCREEN' }, '*');
                                    });
                                } else {
                                    window.parent.postMessage({ type: 'TOGGLE_FULLSCREEN' }, '*');
                                }
                            });
                        } else if (iframe.webkitRequestFullscreen) {
                            iframe.webkitRequestFullscreen();
                        } else if (container.requestFullscreen) {
                            container.requestFullscreen().catch(function() {
                                window.parent.postMessage({ type: 'TOGGLE_FULLSCREEN' }, '*');
                            });
                        } else {
                            window.parent.postMessage({ type: 'TOGGLE_FULLSCREEN' }, '*');
                        }
                    }, { capture: true });
                });
            } catch (_) {}
        }

        // Detect videos after page load - run early to prevent other scripts from scrolling
        window.addEventListener('load', function() {
            // Save initial scroll position
            const savedScrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            const savedScrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
            
            setTimeout(function(){
                detectVideos();
                installVideoOverlays();
                
                // Restore scroll position after modifications
                requestAnimationFrame(function() {
                    window.scrollTo(savedScrollLeft, savedScrollTop);
                });
            }, 100); // Run early to avoid conflicts with other scripts
        });

        // Also detect after DOM mutations (in case video is added dynamically)
        try {
            let videoDetectTimer = null;
            const videoObserver = new MutationObserver(() => {
                if (videoDetectTimer) clearTimeout(videoDetectTimer);
                videoDetectTimer = setTimeout(function(){
                    // Save scroll position before modifications
                    const savedScrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                    const savedScrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
                    
                    detectVideos();
                    installVideoOverlays();
                    
                    // Restore scroll position
                    function restoreScroll() {
                        const currentTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                        if (Math.abs(currentTop - savedScrollTop) > 1) {
                            window.scrollTo(savedScrollLeft, savedScrollTop);
                        }
                    }
                    restoreScroll();
                    requestAnimationFrame(restoreScroll);
                }, 500);
            });
            videoObserver.observe(document, { childList: true, subtree: true });
        } catch (e) {
            // ignore if MutationObserver not available
        }

        // Listen for restore video time message
        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'RESTORE_VIDEO_TIME' && event.data.videoUrl) {
                try {
                    const targetUrl = event.data.videoUrl;
                    const targetTime = event.data.currentTime || 0;
                    const videos = document.querySelectorAll('video');
                    let matched = false;
                    
                    // Extract filename from target URL
                    const targetFilename = targetUrl.split('/').pop() || '';
                    
                    videos.forEach(function(video) {
                        if (matched) return;
                        
                        let videoSrc = video.src || '';
                        // Check source elements
                        if (!videoSrc && video.querySelector('source')) {
                            videoSrc = video.querySelector('source').src || '';
                        }
                        if (!videoSrc) videoSrc = video.currentSrc || '';
                        
                        if (!videoSrc) return;
                        
                        // Match by exact URL, or by filename
                        const videoFilename = videoSrc.split('/').pop() || '';
                        const exactMatch = videoSrc === targetUrl || videoSrc.includes(targetUrl) || targetUrl.includes(videoSrc);
                        const filenameMatch = targetFilename && videoFilename && videoFilename === targetFilename;
                        
                        if (exactMatch || filenameMatch) {
                            console.log('[Proxy Injected Script] Restoring video time:', videoSrc, 'to', targetTime);
                            video.currentTime = targetTime;
                            video.play().catch(function() {});
                            matched = true;
                        }
                    });
                    
                    if (!matched) {
                        console.warn('[Proxy Injected Script] No matching video found for:', targetUrl);
                    }
                } catch (e) {
                    console.error('[Proxy Injected Script] Error restoring video time:', e);
                }
            }
        });
    })();
</script>
"#;

// Handler for CORS preflight requests
async fn cors_options_handler() -> Response {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Authorization")
        .header(header::ACCESS_CONTROL_MAX_AGE, "86400")
        .body(Body::empty())
        .unwrap()
}

pub async fn start_proxy_server(state: ProxyState) -> u16 {
    let port = portpicker::pick_unused_port().expect("failed to find a free port");

    let app = Router::new()
        .route("/proxy", get(proxy_resource_handler).options(cors_options_handler))
        .route("/*path", get(proxy_handler).options(cors_options_handler))
        .with_state(state)
        .layer(middleware::from_fn(log_requests))
        .layer(TraceLayer::new_for_http());

    tokio::spawn(async move {
        let listener = TcpListener::bind(format!("localhost:{}", port))
            .await
            .unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    port
}

// Handler for proxying external resources via /proxy?url=...
async fn proxy_resource_handler(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<ProxyState>,
    req: Request<Body>,
) -> Result<Response, StatusCode> {
    let target_url_str = params.get("url").ok_or_else(|| {
        eprintln!("Proxy resource handler: No 'url' parameter provided");
        StatusCode::BAD_REQUEST
    })?;
    
    println!("Proxy resource handler - RAW URL parameter: '{}'", target_url_str);
    
    // Decode the URL parameter
    let decoded_url = urlencoding::decode(target_url_str).map_err(|e| {
        eprintln!("Proxy resource handler: Failed to decode URL '{}': {}", target_url_str, e);
        StatusCode::BAD_REQUEST
    })?;
    
    println!("Proxy resource handler - DECODED URL: '{}'", decoded_url);
    println!("Proxy resource handler - all params: {:?}", params);
    
    let target_url = Url::parse(&decoded_url).map_err(|e| {
        eprintln!("Proxy resource handler: Failed to parse decoded URL '{}': {}", decoded_url, e);
        StatusCode::BAD_REQUEST
    })?;

    // Extract domain for auth lookup
    let domain = format!("{}://{}", 
        target_url.scheme(), 
        target_url.host_str().unwrap_or("localhost")
    );
    
    // Check for auth credentials for this domain
    let auth_credentials = {
        let creds = state.auth_credentials.lock().unwrap();
        creds.get(&domain).cloned()
    };

    let (parts, body) = req.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let mut client_req_builder = client.request(parts.method, target_url.clone());
    
    // Add HTTP Basic Auth if credentials are available
    if let Some((username, password)) = auth_credentials {
        println!("Adding HTTP Basic Auth for: {}", domain);
        client_req_builder = client_req_builder.basic_auth(username, Some(password));
    }
    
    // For images and other resources, use the base_url (article URL) as Referer
    // This helps bypass hotlinking protection on CDNs
    let referer_url = {
        let base_url_guard = state.base_url.lock().unwrap();
        base_url_guard.to_string()
    };
    
    let client_req = client_req_builder
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(header::ACCEPT_ENCODING, "gzip, deflate, br")
        .header(header::CONNECTION, "keep-alive")
        .header(header::REFERER, referer_url)
        .header(header::HOST, target_url.host_str().unwrap_or("localhost"))
        .body(body_bytes)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = client
        .execute(client_req)
        .await
        .map_err(|e| {
            eprintln!("Proxy resource handler: Request failed for '{}': {}", target_url, e);
            StatusCode::BAD_GATEWAY
        })?;

    println!("Proxy resource handler - response status: {} for URL: {}", response.status(), target_url);
    
    // Check for 401 Unauthorized
    if response.status() == StatusCode::UNAUTHORIZED {
        println!("401 Unauthorized in resource handler - auth required for: {}", domain);
        // Return HTML page with script that requests auth via postMessage
        let domain_escaped = domain.replace('\'', "\\'");
        let auth_html = format!(
            r#"<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script>
window.parent.postMessage({{
  type: 'PROXY_AUTH_REQUIRED',
  domain: '{}'
}}, '*');
</script>
<p style="font-family: system-ui; text-align: center; padding: 2rem;">
Authentication required for {}
</p>
</body>
</html>"#,
            domain_escaped, domain
        );
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(auth_html))
            .unwrap());
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let mut builder = Response::builder().status(response.status());
    
    // Add CORS headers to allow fetch from the frontend
    builder = builder
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Authorization");
    
    // Copy headers but exclude problematic ones
    for (key, value) in response.headers() {
        if key != header::CONTENT_LENGTH 
            && key != header::CONTENT_SECURITY_POLICY
            && key != "x-frame-options"
            && key != "transfer-encoding" // Let Axum handle this
        {
            builder = builder.header(key, value);
        }
    }

    // Get proxy port for building resource URLs
    let proxy_port = {
        let port_guard = state.port.lock().unwrap();
        port_guard.unwrap_or(3000)
    };

    if content_type.contains("text/html") {
        let text = response.text().await.unwrap();
        let mut output = Vec::new();

        let final_script = LISTENER_SCRIPT.to_string();

        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![
                    // Rewrite all src attributes (images, scripts, etc.)
                    element!("*[src]", |el| {
                        if let Some(src) = el.get_attribute("src") {
                            if !src.starts_with("data:") && !src.starts_with("blob:") && !src.starts_with("http://localhost:") && !src.starts_with("https://") && !src.starts_with("http://") {
                                // Build absolute URL relative to current target
                                let absolute_url = match target_url.join(&src) {
                                    Ok(url) => url.to_string(),
                                    Err(_) => return Ok(())
                                };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                el.set_attribute("src", &proxy_url).unwrap();
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite href attributes for stylesheets and other resources (not navigation links)
                    element!("link[href], area[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("data:") && !href.starts_with("blob:") && !href.starts_with("http://localhost:") && !href.starts_with("#") && !href.starts_with("javascript:") && !href.starts_with("mailto:") && !href.starts_with("https://") && !href.starts_with("http://") {
                                let absolute_url = match target_url.join(&href) { Ok(url) => url.to_string(), Err(_) => return Ok(()) };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                el.set_attribute("href", &proxy_url).unwrap();
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite navigation links to proxy resource handler as well
                    element!("a[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("data:") && !href.starts_with("blob:") && !href.starts_with("http://localhost:") && !href.starts_with("#") && !href.starts_with("javascript:") && !href.starts_with("mailto:") && !href.starts_with("https://") && !href.starts_with("http://") {
                                let absolute_url = match target_url.join(&href) { Ok(url) => url.to_string(), Err(_) => return Ok(()) };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                el.set_attribute("href", &proxy_url).unwrap();
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite srcset attributes for responsive images
                    element!("*[srcset]", |el| {
                        if let Some(srcset) = el.get_attribute("srcset") {
                            let mut new_srcset = String::new();
                            for src_descriptor in srcset.split(',') {
                                let parts: Vec<&str> = src_descriptor.trim().split_whitespace().collect();
                                if let Some(url) = parts.first() {
                                    if !url.starts_with("data:") && !url.starts_with("blob:") && !url.starts_with("http://localhost:") && !url.starts_with("https://") && !url.starts_with("http://") {
                                        if let Ok(absolute_url) = target_url.join(url) {
                                            let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(absolute_url.as_str()));
                                            new_srcset.push_str(&proxy_url);
                                            if parts.len() > 1 { new_srcset.push(' '); new_srcset.push_str(parts[1]); }
                                            new_srcset.push_str(", ");
                                        }
                                    } else {
                                        new_srcset.push_str(src_descriptor);
                                        new_srcset.push_str(", ");
                                    }
                                }
                            }
                            if new_srcset.ends_with(", ") { new_srcset.truncate(new_srcset.len() - 2); }
                            el.set_attribute("srcset", &new_srcset).unwrap();
                        }
                        Ok(())
                    }),
                    // Inject our script
                    element!("body", |el| {
                        el.append(&final_script, lol_html::html_content::ContentType::Html);
                        Ok(())
                    }),
                ],
                ..Settings::default()
            },
            |c: &[u8]| output.extend_from_slice(c),
        );

        rewriter.write(text.as_bytes()).unwrap();
        rewriter.end().unwrap();

        return Ok(builder.body(Body::from(output)).unwrap());
    }

    let body = Body::from_stream(response.bytes_stream());
    Ok(builder.body(body).unwrap())
}

async fn proxy_handler(
    Path(path): Path<String>,
    State(state): State<ProxyState>,
    req: Request<Body>,
) -> Result<Response, StatusCode> {
    let base_url = state.base_url.lock().unwrap().clone();
    
    // Check if this is a resource request (CSS, JS, images, etc.)
    let is_resource = path.ends_with(".css") || path.ends_with(".js") || path.ends_with(".png") || 
                     path.ends_with(".jpg") || path.ends_with(".jpeg") || path.ends_with(".gif") || 
                     path.ends_with(".svg") || path.ends_with(".ico") || path.ends_with(".woff") || 
                     path.ends_with(".woff2") || path.ends_with(".ttf") || path.ends_with(".eot") ||
                     path.starts_with("assets/") || path.starts_with("images/") || path.starts_with("fonts/");
    
    if is_resource {
        println!("🔄 REDIRECTING RESOURCE: {} -> proxy resource handler", path);
        // Build the full URL for the resource using domain root 
        // Note: Axum Path strips the leading '/' so we need to add it back for absolute paths
        // Most resources are absolute paths from domain root, not relative to current page
        let resource_url = format!("{}://{}/{}", base_url.scheme(), base_url.host_str().unwrap_or("localhost"), path);
        println!("🔗 RESOURCE URL: {} -> {}", path, resource_url);
        
        // Create a new request with the url parameter for the resource handler
        let mut query_params = HashMap::new();
        query_params.insert("url".to_string(), resource_url);
        
        // Call the resource handler directly
        return proxy_resource_handler(Query(query_params), State(state), req).await;
    }
    
    let target_url = base_url.join(&path).map_err(|_| StatusCode::BAD_REQUEST)?;

    // Get the actual proxy port from state
    let proxy_port = {
        let port_guard = state.port.lock().unwrap();
        port_guard.unwrap_or(3000)
    };

    // Extract domain for auth lookup
    let domain = format!("{}://{}", 
        target_url.scheme(), 
        target_url.host_str().unwrap_or("localhost")
    );
    
    // Check for auth credentials for this domain
    let auth_credentials = {
        let creds = state.auth_credentials.lock().unwrap();
        creds.get(&domain).cloned()
    };

    let (parts, body) = req.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Build request with filtered headers (exclude problematic ones)
    let mut client_req_builder = client.request(parts.method, target_url.clone());
    
    // Copy headers but exclude problematic ones
    for (name, value) in parts.headers.iter() {
        if name != header::HOST && name != header::CONNECTION && name != header::AUTHORIZATION {
            client_req_builder = client_req_builder.header(name, value);
        }
    }
    
    // Add HTTP Basic Auth if credentials are available
    if let Some((username, password)) = auth_credentials {
        println!("Adding HTTP Basic Auth for: {}", domain);
        client_req_builder = client_req_builder.basic_auth(username, Some(password));
    }
    
    // For images and other resources, use the base_url (article URL) as Referer
    // This helps bypass hotlinking protection on CDNs
    let referer_url = {
        let base_url_guard = state.base_url.lock().unwrap();
        base_url_guard.to_string()
    };
    
    let client_req = client_req_builder
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(header::ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(header::ACCEPT_ENCODING, "gzip, deflate, br")
        .header(header::CONNECTION, "keep-alive")
        .header("Upgrade-Insecure-Requests", "1")
        .header(header::REFERER, referer_url)
        .header(header::HOST, target_url.host_str().unwrap_or("localhost"))
        .body(body_bytes)
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = client
        .execute(client_req)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    
    // Check for 401 Unauthorized
    if response.status() == StatusCode::UNAUTHORIZED {
        println!("401 Unauthorized - auth required for: {}", domain);
        // Return HTML page with script that requests auth via postMessage
        let domain_escaped = domain.replace('\'', "\\'");
        let auth_html = format!(
            r#"<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<script>
window.parent.postMessage({{
  type: 'PROXY_AUTH_REQUIRED',
  domain: '{}'
}}, '*');
</script>
<p style="font-family: system-ui; text-align: center; padding: 2rem;">
Authentication required for {}
</p>
</body>
</html>"#,
            domain_escaped, domain
        );
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(auth_html))
            .unwrap());
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let mut builder = Response::builder().status(response.status());
    
    // Add CORS headers to allow fetch from the frontend
    builder = builder
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Authorization");
    
    // Copy headers but exclude problematic ones
    for (key, value) in response.headers() {
        if key != header::CONTENT_LENGTH 
            && key != header::CONTENT_SECURITY_POLICY
            && key != "x-frame-options"
            && key != "transfer-encoding" // Let Axum handle this
        {
            builder = builder.header(key, value);
        }
    }

    if content_type.contains("text/html") {
        let text = response.text().await.unwrap();
        let mut output = Vec::new();

        let final_script = LISTENER_SCRIPT.to_string();

        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![
                    // Rewrite all src attributes (images, scripts, etc.)
                    element!("*[src]", |el| {
                        if let Some(src) = el.get_attribute("src") {
                            if src.contains("linuxfr2_plusieur.png") {
                                println!("🖼️  FOUND TARGET IMAGE: src='{}'", src);
                            }
                            if !src.starts_with("data:") && !src.starts_with("blob:") && !src.starts_with("http://localhost:") && !src.starts_with("https://") && !src.starts_with("http://") {
                                let absolute_url = if src.starts_with("//") {
                                    // Protocol-relative URL
                                    format!("{}:{}", target_url.scheme(), src)
                                } else if src.starts_with("/") {
                                    // Absolute path from domain root
                                    format!("{}://{}{}", target_url.scheme(), target_url.host_str().unwrap_or("localhost"), src)
                                } else {
                                    // Relative path
                                    match target_url.join(&src) {
                                        Ok(url) => url.to_string(),
                                        Err(_) => {
                                            println!("Failed to join src '{}' with base '{}'", src, target_url);
                                            return Ok(());
                                        }
                                    }
                                };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                println!("Rewriting src '{}' -> '{}' (base: {})", src, proxy_url, target_url);
                                el.set_attribute("src", &proxy_url).unwrap();
                            } else {
                                println!("Skipping src '{}' (data/blob/localhost/absolute)", src);
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite href attributes for stylesheets and other resources (not navigation links)
                    element!("link[href], area[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("data:") && !href.starts_with("blob:") && !href.starts_with("http://localhost:") && !href.starts_with("#") && !href.starts_with("javascript:") && !href.starts_with("mailto:") && !href.starts_with("https://") && !href.starts_with("http://") {
                                let absolute_url = if href.starts_with("//") {
                                    // Protocol-relative URL
                                    format!("{}:{}", target_url.scheme(), href)
                                } else if href.starts_with("/") {
                                    // Absolute path from domain root
                                    format!("{}://{}{}", target_url.scheme(), target_url.host_str().unwrap_or("localhost"), href)
                                } else {
                                    // Relative path
                                    match target_url.join(&href) {
                                        Ok(url) => url.to_string(),
                                        Err(_) => {
                                            println!("Failed to join href '{}' with base '{}'", href, target_url);
                                            return Ok(());
                                        }
                                    }
                                };
                                let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(&absolute_url));
                                println!("Rewriting resource href '{}' -> '{}' (base: {})", href, proxy_url, target_url);
                                el.set_attribute("href", &proxy_url).unwrap();
                            } else {
                                println!("Skipping href '{}' (data/blob/localhost/anchor/js/mailto/absolute)", href);
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite navigation links to use direct paths (handled by main proxy handler)
                    element!("a[href]", |el| {
                        if let Some(href) = el.get_attribute("href") {
                            if !href.starts_with("data:") && !href.starts_with("blob:") && !href.starts_with("http://localhost:") && !href.starts_with("#") && !href.starts_with("javascript:") && !href.starts_with("mailto:") && !href.starts_with("https://") && !href.starts_with("http://") {
                                // For navigation links, just rewrite to be relative to proxy root
                                if href.starts_with("/") {
                                    // Remove leading slash since Axum will add it
                                    let new_href = &href[1..];
                                    println!("Rewriting navigation href '{}' -> '{}' (direct)", href, new_href);
                                    el.set_attribute("href", new_href).unwrap();
                                }
                                // Keep relative paths as-is for navigation
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite action attributes in forms
                    element!("form[action]", |el| {
                        if let Some(action) = el.get_attribute("action") {
                            if !action.starts_with("data:") && !action.starts_with("blob:") && !action.starts_with("http://localhost:") && !action.starts_with("#") && !action.starts_with("javascript:") {
                                if let Ok(absolute_url) = target_url.join(&action) {
                                    let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(absolute_url.as_str()));
                                    el.set_attribute("action", &proxy_url).unwrap();
                                }
                            }
                        }
                        Ok(())
                    }),
                    // Rewrite srcset attributes for responsive images
                    element!("*[srcset]", |el| {
                        if let Some(srcset) = el.get_attribute("srcset") {
                            let mut new_srcset = String::new();
                            for src_descriptor in srcset.split(',') {
                                let parts: Vec<&str> = src_descriptor.trim().split_whitespace().collect();
                                if let Some(url) = parts.first() {
                                    if !url.starts_with("data:") && !url.starts_with("blob:") && !url.starts_with("http://localhost:") {
                                        if let Ok(absolute_url) = target_url.join(url) {
                                            let proxy_url = format!("http://localhost:{}/proxy?url={}", proxy_port, urlencoding::encode(absolute_url.as_str()));
                                            new_srcset.push_str(&proxy_url);
                                            if parts.len() > 1 {
                                                new_srcset.push(' ');
                                                new_srcset.push_str(parts[1]);
                                            }
                                            new_srcset.push_str(", ");
                                        }
                                    } else {
                                        new_srcset.push_str(src_descriptor);
                                        new_srcset.push_str(", ");
                                    }
                                }
                            }
                            if new_srcset.ends_with(", ") {
                                new_srcset.truncate(new_srcset.len() - 2);
                            }
                            el.set_attribute("srcset", &new_srcset).unwrap();
                        }
                        Ok(())
                    }),
                    // Inject our script
                    element!("body", |el| {
                        el.append(&final_script, lol_html::html_content::ContentType::Html);
                        Ok(())
                    }),
                ],
                ..Settings::default()
            },
            |c: &[u8]| output.extend_from_slice(c),
        );

        rewriter.write(text.as_bytes()).unwrap();
        rewriter.end().unwrap();

        // Log a sample of navigation links in the final HTML for debugging
        let html_sample = String::from_utf8_lossy(&output);
        if let Some(start) = html_sample.find("<a href=") {
            let end = (start + 100).min(html_sample.len());
            println!("📄 NAVIGATION SAMPLE: {}", &html_sample[start..end]);
        }

        Ok(builder.body(Body::from(output)).unwrap())
    } else {
        let body = Body::from_stream(response.bytes_stream());
        Ok(builder.body(body).unwrap())
    }
}