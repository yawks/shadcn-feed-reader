package net.yawks.feedreader;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import net.yawks.feedreader.plugin.rawhtml.RawHtmlPlugin;
import net.yawks.feedreader.plugin.clipboard.ClipboardPlugin;

public class MainActivity extends BridgeActivity {
    // Store last known insets to re-send them when needed
    private int lastInsetTop = 0;
    private int lastInsetBottom = 0;
    private android.webkit.WebView cachedWebView = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("MainActivity", "Registering plugins BEFORE onCreate...");
        // Register plugins explicitly - MUST be called BEFORE super.onCreate()
        registerPlugin(RawHtmlPlugin.class);
        registerPlugin(ClipboardPlugin.class);
        Log.d("MainActivity", "Plugins registered, calling super.onCreate()...");
        super.onCreate(savedInstanceState);
        Log.d("MainActivity", "MainActivity initialized successfully");

        // Attempt to propagate Android WindowInsets to the web layer so the
        // web UI can reliably adjust bottom paddings when system UI (navigation
        // bar / gesture area) overlaps the WebView. We dispatch a custom
        // DOM event `capacitor-window-insets` with { detail: { bottom } }.
        try {
            android.webkit.WebView webView = null;
            try {
                if (this.bridge != null) {
                    Object w = this.bridge.getWebView();
                    if (w instanceof android.webkit.WebView) {
                        webView = (android.webkit.WebView) w;
                    }
                }
            } catch (Throwable ignored) {
            }

            if (webView == null) {
                try {
                    java.lang.reflect.Method getBridge = this.getClass().getMethod("getBridge");
                    Object bridgeObj = getBridge.invoke(this);
                    if (bridgeObj != null) {
                        java.lang.reflect.Method getWebView = bridgeObj.getClass().getMethod("getWebView");
                        Object webViewObj = getWebView.invoke(bridgeObj);
                        if (webViewObj instanceof android.webkit.WebView) {
                            webView = (android.webkit.WebView) webViewObj;
                        }
                    }
                } catch (Throwable t) {
                    // ignore
                }
            }

            if (webView != null) {
                final android.webkit.WebView finalWebView = webView;
                
                // Enable pinch-to-zoom on WebView
                android.webkit.WebSettings webSettings = finalWebView.getSettings();
                if (webSettings != null) {
                    webSettings.setSupportZoom(true);
                    webSettings.setBuiltInZoomControls(false); // Hide zoom controls, use pinch-to-zoom
                    webSettings.setDisplayZoomControls(false);
                    Log.d("MainActivity", "WebView zoom enabled: setSupportZoom(true), setBuiltInZoomControls(false), setDisplayZoomControls(false)");
                } else {
                    Log.w("MainActivity", "WebView settings are null, cannot enable zoom");
                }
                
                // Listen to window insets on the activity's decor view; when changed,
                // forward the insets to the web layer as a CustomEvent.
                this.getWindow().getDecorView().setOnApplyWindowInsetsListener(new android.view.View.OnApplyWindowInsetsListener() {
                    @Override
                    public android.view.WindowInsets onApplyWindowInsets(android.view.View v, android.view.WindowInsets insets) {
                        final int top = insets.getSystemWindowInsetTop();
                        final int bottom = insets.getSystemWindowInsetBottom();
                        Log.d("MainActivity", "WindowInsets changed: top=" + top + ", bottom=" + bottom);

                        // Store insets for later use
                        lastInsetTop = top;
                        lastInsetBottom = bottom;
                        cachedWebView = finalWebView;

                        dispatchInsetsToWebView(finalWebView, top, bottom);
                        return insets;
                    }
                });

                // Force request window insets to ensure initial values are sent
                this.getWindow().getDecorView().requestApplyInsets();
            }
        } catch (Throwable t) {
            Log.w("MainActivity", "Failed to setup WindowInsets forwarder", t);
        }
    }

    // Helper method to dispatch insets to WebView
    private void dispatchInsetsToWebView(final android.webkit.WebView webView, final int top, final int bottom) {
        try {
            final String js = "window.dispatchEvent(new CustomEvent('capacitor-window-insets',{detail:{top:" + top + ",bottom:" + bottom + "}}));";
            webView.post(new Runnable() {
                @Override
                public void run() {
                    try {
                        webView.evaluateJavascript(js, null);
                        Log.d("MainActivity", "Dispatched insets to JS: top=" + top + ", bottom=" + bottom);
                    } catch (Throwable t) {
                        Log.w("MainActivity", "Failed to dispatch insets to JS", t);
                    }
                }
            });
        } catch (Throwable t) {
            Log.w("MainActivity", "Failed to post insets dispatch", t);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-request window insets when app regains focus
        // This ensures safe areas are correctly applied after the app was backgrounded
        try {
            this.getWindow().getDecorView().requestApplyInsets();
            Log.d("MainActivity", "onResume: requested window insets");

            // Also re-dispatch cached insets after a short delay
            // This ensures the JS layer receives the insets even if the system doesn't re-send them
            if (cachedWebView != null && (lastInsetTop > 0 || lastInsetBottom > 0)) {
                cachedWebView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        Log.d("MainActivity", "onResume: re-dispatching cached insets after delay");
                        dispatchInsetsToWebView(cachedWebView, lastInsetTop, lastInsetBottom);
                    }
                }, 100);
            }
        } catch (Throwable t) {
            Log.w("MainActivity", "onResume: failed to request insets", t);
        }
    }

    @Override
    public void onBackPressed() {
        // Try to navigate the WebView history first. If not possible, fall back to default behavior.
        try {
            android.webkit.WebView webView = null;
            try {
                // Most Capacitor versions expose a `bridge` field with getWebView()
                if (this.bridge != null) {
                    Object w = this.bridge.getWebView();
                    if (w instanceof android.webkit.WebView) {
                        webView = (android.webkit.WebView) w;
                    }
                }
            } catch (Throwable ignored) {
                // ignore and try reflection
            }

            if (webView == null) {
                // Fallback: try calling getBridge().getWebView() via reflection
                try {
                    java.lang.reflect.Method getBridge = this.getClass().getMethod("getBridge");
                    Object bridgeObj = getBridge.invoke(this);
                    if (bridgeObj != null) {
                        java.lang.reflect.Method getWebView = bridgeObj.getClass().getMethod("getWebView");
                        Object webViewObj = getWebView.invoke(bridgeObj);
                        if (webViewObj instanceof android.webkit.WebView) {
                            webView = (android.webkit.WebView) webViewObj;
                        }
                    }
                } catch (Throwable t) {
                    // ignore - we'll just fallback to default behavior
                }
            }

            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
        } catch (Throwable t) {
            Log.w("MainActivity", "Error while trying to navigate webview history", t);
        }

        // No web history or error: perform default behavior (exit or previous activity)
        super.onBackPressed();
    }
}
