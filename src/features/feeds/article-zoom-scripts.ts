/**
 * Zoom script for iframe-based article views (readability mode)
 */
export function getIframeZoomScript(): string {
    return `
        (function() {
            console.log('[ZOOM-DIAG] Iframe zoom script loaded');
            
            let currentScale = 1;
            let initialDistance = 0;
            let initialScale = 1;
            let lastTouchCenter = { x: 0, y: 0 };
            let lastPan = { x: 0, y: 0 };
            let naturalContentWidth = 0;
            let naturalContentHeight = 0;
            
            // Measure natural content dimensions once
            function measureContent() {
                const body = document.body;
                if (!body) return;
                // Temporarily remove transform to measure natural size
                const savedTransform = body.style.transform;
                body.style.transform = '';
                naturalContentWidth = body.scrollWidth || body.offsetWidth;
                naturalContentHeight = body.scrollHeight || body.offsetHeight;
                body.style.transform = savedTransform;
            }
            
            // Measure on load
            if (document.readyState === 'complete') {
                measureContent();
            } else {
                window.addEventListener('load', measureContent);
            }
            
            // Prevent body::after from adding extra padding when app regains focus
            function ensureBodyAfterHeight() {
                const style = document.createElement('style');
                style.textContent = 'body::after { content: ""; display: block; height: 0 !important; }';
                document.head.appendChild(style);
            }
            ensureBodyAfterHeight();
            
            // Re-apply on visibility change (when app regains focus)
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) {
                    console.log('[ZOOM-DIAG] Iframe: App regained focus (visibilitychange)');
                    const body = document.body;
                    const html = document.documentElement;
                    if (body && html) {
                        // Log current dimensions before fix
                        const bodyAfter = window.getComputedStyle(body, '::after');
                        const bodyHeightBefore = body.offsetHeight;
                        const bodyScrollHeightBefore = body.scrollHeight;
                        const htmlHeightBefore = html.offsetHeight;
                        const htmlScrollHeightBefore = html.scrollHeight;
                        console.log('[ZOOM-DIAG] Iframe: Before fix - body height:', bodyHeightBefore, 'scrollHeight:', bodyScrollHeightBefore, 'html height:', htmlHeightBefore, 'scrollHeight:', htmlScrollHeightBefore);
                        console.log('[ZOOM-DIAG] Iframe: body::after computed height:', bodyAfter.height);
                        
                        // App regained focus - ensure body::after stays at height 0
                        ensureBodyAfterHeight();
                        
                        // Force a reflow
                        void body.offsetWidth;
                        
                        // Log dimensions after fix
                        const bodyHeightAfter = body.offsetHeight;
                        const bodyScrollHeightAfter = body.scrollHeight;
                        const htmlHeightAfter = html.offsetHeight;
                        const htmlScrollHeightAfter = html.scrollHeight;
                        console.log('[ZOOM-DIAG] Iframe: After fix - body height:', bodyHeightAfter, 'scrollHeight:', bodyScrollHeightAfter, 'html height:', htmlHeightAfter, 'scrollHeight:', htmlScrollHeightAfter);
                        
                        if (bodyHeightAfter !== bodyHeightBefore || bodyScrollHeightAfter !== bodyScrollHeightBefore) {
                            console.warn('[ZOOM-DIAG] Iframe: Dimensions changed after focus!', {
                                bodyHeight: { before: bodyHeightBefore, after: bodyHeightAfter },
                                bodyScrollHeight: { before: bodyScrollHeightBefore, after: bodyScrollHeightAfter },
                                htmlHeight: { before: htmlHeightBefore, after: htmlHeightAfter },
                                htmlScrollHeight: { before: htmlScrollHeightBefore, after: htmlScrollHeightAfter }
                            });
                        }
                    }
                    // Only remeasure if dimensions are zero (content might have changed)
                    if (naturalContentWidth === 0 || naturalContentHeight === 0) {
                        setTimeout(measureContent, 100);
                    }
                }
            });
            
            // Also listen to focus events
            window.addEventListener('focus', function() {
                console.log('[ZOOM-DIAG] Iframe: Window focus event');
                ensureBodyAfterHeight();
            });
            
            // Apply zoom transform to body
            function applyZoom(scale, panX, panY) {
                const body = document.body;
                const html = document.documentElement;
                if (!body || !html) return;
                
                // Clamp scale between 1.0 (100%) and 5
                scale = Math.max(1.0, Math.min(5, scale));
                
                // Reset pan when zoom returns to 100%
                if (scale === 1.0) {
                    panX = 0;
                    panY = 0;
                    lastPan = { x: 0, y: 0 };
                    // Reset dimensions when zoom is 100%
                    body.style.width = '';
                    body.style.height = '';
                    body.style.minHeight = '';
                    html.style.width = '';
                    html.style.height = '';
                    html.style.overflow = '';
                    body.style.overflow = '';
                } else {
                    // Measure if not already measured
                    if (naturalContentWidth === 0 || naturalContentHeight === 0) {
                        measureContent();
                    }
                    
                    // When zoomed, adjust container dimensions to allow proper scrolling
                    // The key is to set html dimensions to the scaled size so the scroll container knows the real size
                    const scaledWidth = naturalContentWidth * scale;
                    const scaledHeight = naturalContentHeight * scale;
                    
                    // Set html dimensions to scaled size - this makes the scroll container aware of the real content size
                    html.style.width = scaledWidth + 'px';
                    html.style.height = scaledHeight + 'px';
                    html.style.overflow = 'auto';
                    
                    // Set body dimensions to match
                    body.style.width = scaledWidth + 'px';
                    body.style.height = scaledHeight + 'px';
                    body.style.minHeight = scaledHeight + 'px';
                    body.style.overflow = 'visible';
                }
                
                // Apply transform
                body.style.transformOrigin = '0 0';
                body.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
                body.style.transition = scale === 1.0 ? 'transform 0.2s' : 'none';
                
                currentScale = scale;
                console.log('[ZOOM-DIAG] Iframe: Applied zoom: scale=' + scale.toFixed(2) + ', html size: ' + (naturalContentWidth * scale) + 'x' + (naturalContentHeight * scale));
            }
            
            // Reset zoom
            function resetZoom() {
                applyZoom(1, 0, 0);
                lastPan = { x: 0, y: 0 };
            }
            
            // Calculate center point between two touches
            function getTouchCenter(touch1, touch2) {
                return {
                    x: (touch1.clientX + touch2.clientX) / 2,
                    y: (touch1.clientY + touch2.clientY) / 2
                };
            }
            
            // Touch start - detect pinch
            document.addEventListener('touchstart', function(e) {
                if (e.touches.length === 2) {
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    initialDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
                    initialScale = currentScale;
                    lastTouchCenter = getTouchCenter(touch1, touch2);
                    console.log('[ZOOM-DIAG] Iframe: Pinch start, scale:', initialScale.toFixed(2));
                } else if (e.touches.length === 1 && currentScale > 1) {
                    e.preventDefault();
                }
            }, { passive: false });
            
            // Touch move - apply zoom or pan
            document.addEventListener('touchmove', function(e) {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
                    
                    if (initialDistance > 0) {
                        // Reduce pinch sensitivity by applying a factor (0.3 = 30% of the distance change affects zoom)
                        const distanceRatio = currentDistance / initialDistance;
                        const zoomFactor = 1 + (distanceRatio - 1) * 0.3;
                        const scale = initialScale * zoomFactor;
                        const touchCenter = getTouchCenter(touch1, touch2);
                        
                        const deltaX = touchCenter.x - lastTouchCenter.x;
                        const deltaY = touchCenter.y - lastTouchCenter.y;
                        
                        lastPan.x += deltaX * (1 - 1/scale);
                        lastPan.y += deltaY * (1 - 1/scale);
                        
                        applyZoom(scale, lastPan.x, lastPan.y);
                        lastTouchCenter = touchCenter;
                    }
                } else if (e.touches.length === 1 && currentScale > 1) {
                    e.preventDefault();
                    const touch = e.touches[0];
                    const deltaX = touch.clientX - (lastTouchCenter.x || touch.clientX);
                    const deltaY = touch.clientY - (lastTouchCenter.y || touch.clientY);
                    
                    lastPan.x += deltaX;
                    lastPan.y += deltaY;
                    applyZoom(currentScale, lastPan.x, lastPan.y);
                    
                    lastTouchCenter = { x: touch.clientX, y: touch.clientY };
                }
            }, { passive: false });
            
            // Touch end
            document.addEventListener('touchend', function(e) {
                if (e.touches.length < 2 && initialDistance > 0) {
                    console.log('[ZOOM-DIAG] Iframe: Pinch end, final scale:', currentScale.toFixed(2));
                    initialDistance = 0;
                    initialScale = currentScale;
                }
                if (e.touches.length === 0) {
                    lastTouchCenter = { x: 0, y: 0 };
                }
            }, { passive: true });
            
            // Double tap to reset
            let lastTapTime = 0;
            document.addEventListener('touchend', function(e) {
                if (e.touches.length === 0) {
                    const currentTime = Date.now();
                    const tapLength = currentTime - lastTapTime;
                    if (tapLength < 300 && tapLength > 0) {
                        resetZoom();
                        console.log('[ZOOM-DIAG] Iframe: Double tap - reset zoom');
                    }
                    lastTapTime = currentTime;
                }
            }, { passive: true });
        })();
    `
}

/**
 * Zoom script for Shadow DOM-based article views (original mode)
 */
export function getShadowDomZoomScript(): string {
    return `
        (function() {
            console.log('[ZOOM-DIAG] Shadow DOM zoom script loaded');
            
            let currentScale = 1;
            let initialDistance = 0;
            let initialScale = 1;
            let lastTouchCenter = { x: 0, y: 0 };
            let lastPan = { x: 0, y: 0 };
            let naturalContentWidth = 0;
            let naturalContentHeight = 0;
            
            // Create or get zoom wrapper
            function getZoomWrapper() {
                let wrapper = document.getElementById('zoom-wrapper');
                if (!wrapper) {
                    wrapper = document.createElement('div');
                    wrapper.id = 'zoom-wrapper';
                    wrapper.style.position = 'relative';
                    wrapper.style.width = '100%';
                    wrapper.style.height = '100%';
                    wrapper.style.display = 'block';
                    // Move body content into wrapper
                    const body = document.body;
                    const html = document.documentElement;
                    // Get all content from body
                    while (body.firstChild) {
                        wrapper.appendChild(body.firstChild);
                    }
                    body.appendChild(wrapper);
                    // Ensure body and html take full size
                    body.style.margin = '0';
                    body.style.padding = '0';
                    html.style.margin = '0';
                    html.style.padding = '0';
                }
                return wrapper;
            }
            
            // Measure natural content dimensions once
            function measureContent() {
                const wrapper = getZoomWrapper();
                if (!wrapper) return;
                // Temporarily remove transform to measure natural size
                const savedTransform = wrapper.style.transform;
                const savedWidth = wrapper.style.width;
                const savedHeight = wrapper.style.height;
                wrapper.style.transform = '';
                wrapper.style.width = '';
                wrapper.style.height = '';
                // Force a reflow to get accurate measurements
                void wrapper.offsetWidth;
                naturalContentWidth = Math.max(wrapper.scrollWidth, wrapper.offsetWidth, document.documentElement.scrollWidth);
                naturalContentHeight = Math.max(wrapper.scrollHeight, wrapper.offsetHeight, document.documentElement.scrollHeight);
                wrapper.style.transform = savedTransform;
                wrapper.style.width = savedWidth;
                wrapper.style.height = savedHeight;
                console.log('[ZOOM-DIAG] Measured content: ' + naturalContentWidth + 'x' + naturalContentHeight);
            }
            
            // Measure on load
            if (document.readyState === 'complete') {
                setTimeout(measureContent, 200);
            } else {
                window.addEventListener('load', () => setTimeout(measureContent, 200));
            }
            
            // Prevent body::after from adding extra padding when app regains focus
            function ensureBodyAfterHeight() {
                const style = document.createElement('style');
                style.textContent = 'body::after { content: ""; display: block; height: 0 !important; }';
                document.head.appendChild(style);
            }
            ensureBodyAfterHeight();
            
            // Prevent horizontal scroll by constraining all content to container width
            function preventHorizontalScroll() {
                const style = document.createElement('style');
                style.textContent = \`
                    * {
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    html, body {
                        overflow-x: hidden !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    img, video, iframe, embed, object {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                    table {
                        max-width: 100% !important;
                        table-layout: auto !important;
                        word-wrap: break-word !important;
                    }
                    pre, code {
                        max-width: 100% !important;
                        overflow-x: auto !important;
                        word-wrap: break-word !important;
                    }
                \`;
                document.head.appendChild(style);
            }
            preventHorizontalScroll();
            
            // Re-apply on visibility change (when app regains focus)
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) {
                    console.log('[ZOOM-DIAG] Shadow DOM: App regained focus (visibilitychange)');
                    const body = document.body;
                    const html = document.documentElement;
                    const shadowRoot = body.getRootNode();
                    const shadowHost = shadowRoot.host;
                    const parent = shadowHost ? shadowHost.parentElement : null;
                    
                    if (body && html) {
                        // Log current dimensions before fix
                        const bodyAfter = window.getComputedStyle(body, '::after');
                        const bodyHeightBefore = body.offsetHeight;
                        const bodyScrollHeightBefore = body.scrollHeight;
                        const htmlHeightBefore = html.offsetHeight;
                        const htmlScrollHeightBefore = html.scrollHeight;
                        const parentHeightBefore = parent ? parent.offsetHeight : 0;
                        const parentScrollHeightBefore = parent ? parent.scrollHeight : 0;
                        const shadowHostHeightBefore = shadowHost ? shadowHost.offsetHeight : 0;
                        
                        console.log('[ZOOM-DIAG] Shadow DOM: Before fix - body height:', bodyHeightBefore, 'scrollHeight:', bodyScrollHeightBefore);
                        console.log('[ZOOM-DIAG] Shadow DOM: Before fix - html height:', htmlHeightBefore, 'scrollHeight:', htmlScrollHeightBefore);
                        console.log('[ZOOM-DIAG] Shadow DOM: Before fix - parent height:', parentHeightBefore, 'scrollHeight:', parentScrollHeightBefore);
                        console.log('[ZOOM-DIAG] Shadow DOM: Before fix - shadowHost height:', shadowHostHeightBefore);
                        console.log('[ZOOM-DIAG] Shadow DOM: body::after computed height:', bodyAfter.height);
                        
                        // App regained focus - ensure body::after stays at height 0
                        ensureBodyAfterHeight();
                        
                        // Force a reflow
                        void body.offsetWidth;
                        
                        // Log dimensions after fix
                        const bodyHeightAfter = body.offsetHeight;
                        const bodyScrollHeightAfter = body.scrollHeight;
                        const htmlHeightAfter = html.offsetHeight;
                        const htmlScrollHeightAfter = html.scrollHeight;
                        const parentHeightAfter = parent ? parent.offsetHeight : 0;
                        const parentScrollHeightAfter = parent ? parent.scrollHeight : 0;
                        const shadowHostHeightAfter = shadowHost ? shadowHost.offsetHeight : 0;
                        
                        console.log('[ZOOM-DIAG] Shadow DOM: After fix - body height:', bodyHeightAfter, 'scrollHeight:', bodyScrollHeightAfter);
                        console.log('[ZOOM-DIAG] Shadow DOM: After fix - html height:', htmlHeightAfter, 'scrollHeight:', htmlScrollHeightAfter);
                        console.log('[ZOOM-DIAG] Shadow DOM: After fix - parent height:', parentHeightAfter, 'scrollHeight:', parentScrollHeightAfter);
                        console.log('[ZOOM-DIAG] Shadow DOM: After fix - shadowHost height:', shadowHostHeightAfter);
                        
                        if (bodyHeightAfter !== bodyHeightBefore || bodyScrollHeightAfter !== bodyScrollHeightBefore || 
                            parentHeightAfter !== parentHeightBefore || parentScrollHeightAfter !== parentScrollHeightBefore) {
                            console.warn('[ZOOM-DIAG] Shadow DOM: Dimensions changed after focus!', {
                                bodyHeight: { before: bodyHeightBefore, after: bodyHeightAfter },
                                bodyScrollHeight: { before: bodyScrollHeightBefore, after: bodyScrollHeightAfter },
                                htmlHeight: { before: htmlHeightBefore, after: htmlHeightAfter },
                                htmlScrollHeight: { before: htmlScrollHeightBefore, after: htmlScrollHeightAfter },
                                parentHeight: { before: parentHeightBefore, after: parentHeightAfter },
                                parentScrollHeight: { before: parentScrollHeightBefore, after: parentScrollHeightAfter },
                                shadowHostHeight: { before: shadowHostHeightBefore, after: shadowHostHeightAfter }
                            });
                        }
                    }
                    // Only remeasure if dimensions are zero (content might have changed)
                    if (naturalContentWidth === 0 || naturalContentHeight === 0) {
                        setTimeout(measureContent, 100);
                    }
                }
            });
            
            // Also listen to focus events
            window.addEventListener('focus', function() {
                console.log('[ZOOM-DIAG] Shadow DOM: Window focus event');
                ensureBodyAfterHeight();
            });
            
            // Apply zoom transform to wrapper
            function applyZoom(scale, panX, panY) {
                const wrapper = getZoomWrapper();
                const shadowRoot = document.body.getRootNode();
                const shadowHost = shadowRoot.host;
                if (!wrapper) return;
                
                // Clamp scale between 1.0 (100%) and 5
                scale = Math.max(1.0, Math.min(5, scale));
                
                // Reset pan when zoom returns to 100%
                if (scale === 1.0) {
                    panX = 0;
                    panY = 0;
                    lastPan = { x: 0, y: 0 };
                    // Reset dimensions when zoom is 100%
                    wrapper.style.width = '';
                    wrapper.style.height = '';
                    wrapper.style.minHeight = '';
                    wrapper.style.maxWidth = '100%';
                    // Ensure wrapper doesn't exceed container width
                    wrapper.style.boxSizing = 'border-box';
                    
                    // Reset shadow host container dimensions
                    if (shadowHost && shadowHost.style) {
                        shadowHost.style.width = '';
                        shadowHost.style.height = '';
                        shadowHost.style.minHeight = '';
                        shadowHost.style.maxWidth = '';
                        shadowHost.style.maxHeight = '';
                    }
                    // Reset parent scroll container dimensions
                    if (shadowHost && shadowHost.parentElement && shadowHost.parentElement.style) {
                        const parent = shadowHost.parentElement;
                        parent.style.width = '';
                        parent.style.height = '';
                        parent.style.minHeight = '';
                        parent.style.minWidth = '';
                        parent.style.maxWidth = '';
                        parent.style.maxHeight = '';
                        // Ensure no horizontal scroll at 100% zoom
                        parent.style.overflowX = 'hidden';
                        parent.style.overflowY = 'auto';
                        // Restore h-full class
                        parent.classList.add('h-full');
                    }
                    
                    // Ensure body and html don't exceed container width
                    const body = document.body;
                    const html = document.documentElement;
                    if (body) {
                        body.style.maxWidth = '100%';
                        body.style.overflowX = 'hidden';
                        body.style.boxSizing = 'border-box';
                    }
                    if (html) {
                        html.style.maxWidth = '100%';
                        html.style.overflowX = 'hidden';
                        html.style.boxSizing = 'border-box';
                    }
                } else {
                    // Measure if not already measured
                    if (naturalContentWidth === 0 || naturalContentHeight === 0) {
                        measureContent();
                    }
                    
                    // When zoomed, adjust container dimensions to allow proper scrolling
                    const scaledWidth = naturalContentWidth * scale;
                    const scaledHeight = naturalContentHeight * scale;
                    
                    // Set wrapper dimensions to scaled size
                    wrapper.style.width = scaledWidth + 'px';
                    wrapper.style.height = scaledHeight + 'px';
                    wrapper.style.minHeight = scaledHeight + 'px';
                    
                    // Adjust shadow host container dimensions - use min/max to ensure it takes the full size
                    if (shadowHost && shadowHost.style) {
                        shadowHost.style.width = scaledWidth + 'px';
                        shadowHost.style.height = scaledHeight + 'px';
                        shadowHost.style.minWidth = scaledWidth + 'px';
                        shadowHost.style.minHeight = scaledHeight + 'px';
                        shadowHost.style.maxWidth = scaledWidth + 'px';
                        shadowHost.style.maxHeight = scaledHeight + 'px';
                        shadowHost.style.display = 'block';
                    }
                    
                    // CRITICAL: Adjust parent scroll container dimensions so it knows the real content size
                    // The parent div (injectedHtmlRef) has overflow-auto and h-full which limits height
                    // We need to override h-full when zoomed to allow expansion
                    if (shadowHost && shadowHost.parentElement && shadowHost.parentElement.style) {
                        const parent = shadowHost.parentElement;
                        // Remove height constraint (h-full) by setting height to auto or the scaled height
                        parent.style.height = 'auto';
                        parent.style.minHeight = scaledHeight + 'px';
                        parent.style.minWidth = scaledWidth + 'px';
                        // Remove max constraints that might limit scrolling
                        parent.style.maxWidth = '';
                        parent.style.maxHeight = '';
                        // Ensure overflow is enabled
                        parent.style.overflow = 'auto';
                        parent.style.overflowX = 'auto';
                        parent.style.overflowY = 'auto';
                        // Remove any height constraints from classes
                        parent.classList.remove('h-full');
                        // Force the parent to recognize the new size
                        parent.style.display = 'block';
                        // Force a reflow to ensure dimensions are applied
                        void parent.offsetWidth;
                        void parent.offsetHeight;
                        console.log('[ZOOM-DIAG] Parent container adjusted: minHeight=' + scaledHeight + ', minWidth=' + scaledWidth);
                    }
                }
                
                // Apply transform to wrapper instead of body
                wrapper.style.transformOrigin = '0 0';
                // At 100% zoom, ensure no transform offset (pan should be exactly 0)
                if (scale === 1.0) {
                    wrapper.style.transform = 'scale(1)';
                    wrapper.style.left = '0';
                    wrapper.style.marginLeft = '0';
                } else {
                    wrapper.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
                }
                wrapper.style.transition = scale === 1.0 ? 'transform 0.2s' : 'none';
                
                currentScale = scale;
                console.log('[ZOOM-DIAG] Applied zoom: scale=' + scale.toFixed(2) + ', pan=(' + panX + ', ' + panY + '), size: ' + (naturalContentWidth * scale) + 'x' + (naturalContentHeight * scale));
            }
            
            // Reset zoom
            function resetZoom() {
                applyZoom(1, 0, 0);
                lastPan = { x: 0, y: 0 };
            }
            
            // Calculate center point between two touches
            function getTouchCenter(touch1, touch2) {
                return {
                    x: (touch1.clientX + touch2.clientX) / 2,
                    y: (touch1.clientY + touch2.clientY) / 2
                };
            }
            
            // Touch start - detect pinch
            document.addEventListener('touchstart', function(e) {
                if (e.touches.length === 2) {
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    initialDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
                    initialScale = currentScale;
                    lastTouchCenter = getTouchCenter(touch1, touch2);
                    console.log('[ZOOM-DIAG] Pinch start, initial distance:', initialDistance.toFixed(2), 'scale:', initialScale.toFixed(2));
                } else if (e.touches.length === 1 && currentScale > 1) {
                    // Single touch when zoomed - allow panning
                    e.preventDefault();
                }
            }, { passive: false });
            
            // Touch move - apply zoom or pan
            document.addEventListener('touchmove', function(e) {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
                    
                    if (initialDistance > 0) {
                        // Reduce pinch sensitivity by applying a factor (0.3 = 30% of the distance change affects zoom)
                        const distanceRatio = currentDistance / initialDistance;
                        const zoomFactor = 1 + (distanceRatio - 1) * 0.3;
                        const scale = initialScale * zoomFactor;
                        const touchCenter = getTouchCenter(touch1, touch2);
                        
                        // Calculate pan to keep zoom centered on pinch point
                        const deltaX = touchCenter.x - lastTouchCenter.x;
                        const deltaY = touchCenter.y - lastTouchCenter.y;
                        
                        lastPan.x += deltaX * (1 - 1/scale);
                        lastPan.y += deltaY * (1 - 1/scale);
                        
                        applyZoom(scale, lastPan.x, lastPan.y);
                        lastTouchCenter = touchCenter;
                    }
                } else if (e.touches.length === 1 && currentScale > 1) {
                    // Pan when zoomed
                    e.preventDefault();
                    const touch = e.touches[0];
                    const deltaX = touch.clientX - (lastTouchCenter.x || touch.clientX);
                    const deltaY = touch.clientY - (lastTouchCenter.y || touch.clientY);
                    
                    lastPan.x += deltaX;
                    lastPan.y += deltaY;
                    applyZoom(currentScale, lastPan.x, lastPan.y);
                    
                    lastTouchCenter = { x: touch.clientX, y: touch.clientY };
                }
            }, { passive: false });
            
            // Touch end - finalize zoom
            document.addEventListener('touchend', function(e) {
                if (e.touches.length < 2 && initialDistance > 0) {
                    console.log('[ZOOM-DIAG] Pinch end, final scale:', currentScale.toFixed(2));
                    initialDistance = 0;
                    initialScale = currentScale;
                }
                if (e.touches.length === 0) {
                    lastTouchCenter = { x: 0, y: 0 };
                }
            }, { passive: true });
            
            // Double tap to reset zoom
            let lastTapTime = 0;
            document.addEventListener('touchend', function(e) {
                if (e.touches.length === 0) {
                    const currentTime = Date.now();
                    const tapLength = currentTime - lastTapTime;
                    if (tapLength < 300 && tapLength > 0) {
                        // Double tap detected
                        resetZoom();
                        console.log('[ZOOM-DIAG] Double tap - reset zoom');
                    }
                    lastTapTime = currentTime;
                }
            }, { passive: true });
        })();
    `
}

