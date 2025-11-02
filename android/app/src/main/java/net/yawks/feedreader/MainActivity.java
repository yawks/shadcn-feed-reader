package net.yawks.feedreader;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("MainActivity", "Registering RawHtmlPlugin BEFORE onCreate...");
        // Register RawHtmlPlugin explicitly - MUST be called BEFORE super.onCreate()
        registerPlugin(RawHtmlPlugin.class);
        Log.d("MainActivity", "RawHtmlPlugin registered, calling super.onCreate()...");
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
                // Listen to window insets on the activity's decor view; when changed,
                // forward the bottom inset to the web layer as a CustomEvent.
                this.getWindow().getDecorView().setOnApplyWindowInsetsListener(new android.view.View.OnApplyWindowInsetsListener() {
                    @Override
                    public android.view.WindowInsets onApplyWindowInsets(android.view.View v, android.view.WindowInsets insets) {
                        int bottom = insets.getSystemWindowInsetBottom();
                        try {
                            final String js = "window.dispatchEvent(new CustomEvent('capacitor-window-insets',{detail:{bottom:" + bottom + "}}));";
                            finalWebView.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        try {
                                            // Dispatch inset event to JS
                                            finalWebView.evaluateJavascript(js, null);
                                        } catch (Throwable t) {
                                            // ignore JS execution errors
                                        }
                                        try {
                                            // Also apply padding on the WebView itself so that the
                                            // embedded content (including cross-origin iframes)
                                            // is visually inset above system UI (navigation bar).
                                            int left = finalWebView.getPaddingLeft();
                                            int top = finalWebView.getPaddingTop();
                                            int right = finalWebView.getPaddingRight();
                                            // Apply bottom inset as padding to avoid content being
                                            // rendered under the system navigation area.
                                            finalWebView.setPadding(left, top, right, bottom);
                                            finalWebView.requestLayout();
                                        } catch (Throwable t) {
                                            // ignore padding errors
                                        }
                                    }
                                });
                        } catch (Throwable t) {
                            // ignore
                        }
                        return insets;
                    }
                });
            }
        } catch (Throwable t) {
            Log.w("MainActivity", "Failed to setup WindowInsets forwarder", t);
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
