package net.yawks.feedreader;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import com.getcapacitor.BridgeActivity;
import net.yawks.feedreader.plugin.rawhtml.RawHtmlPlugin;
import net.yawks.feedreader.plugin.clipboard.ClipboardPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    // Store last known insets to re-send them when needed
    private int lastInsetTop = 0;
    private int lastInsetBottom = 0;
    private android.webkit.WebView cachedWebView = null;
    private boolean isVideoFullscreen = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d(TAG, "Registering plugins BEFORE onCreate...");
        // Register plugins explicitly - MUST be called BEFORE super.onCreate()
        registerPlugin(RawHtmlPlugin.class);
        registerPlugin(ClipboardPlugin.class);
        Log.d(TAG, "Plugins registered, calling super.onCreate()...");
        super.onCreate(savedInstanceState);
        Log.d(TAG, "super.onCreate() done, setting up WebView...");

        // All WebView setup must happen AFTER super.onCreate() because
        // Capacitor's Bridge initializes the WebView during super.onCreate()
        setupWebView();
    }

    /**
     * Find the Capacitor WebView instance. Tries the bridge field first,
     * then falls back to reflection.
     */
    private android.webkit.WebView findWebView() {
        try {
            if (this.bridge != null) {
                Object w = this.bridge.getWebView();
                if (w instanceof android.webkit.WebView) {
                    return (android.webkit.WebView) w;
                }
            }
        } catch (Throwable ignored) {
        }

        try {
            java.lang.reflect.Method getBridge = this.getClass().getMethod("getBridge");
            Object bridgeObj = getBridge.invoke(this);
            if (bridgeObj != null) {
                java.lang.reflect.Method getWebView = bridgeObj.getClass().getMethod("getWebView");
                Object webViewObj = getWebView.invoke(bridgeObj);
                if (webViewObj instanceof android.webkit.WebView) {
                    return (android.webkit.WebView) webViewObj;
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "Failed to find WebView via reflection", t);
        }

        return null;
    }

    /**
     * Single entry point for all WebView configuration.
     * Called once after super.onCreate() when the WebView is available.
     */
    private void setupWebView() {
        try {
            android.webkit.WebView webView = findWebView();
            if (webView == null) {
                Log.w(TAG, "WebView not found after super.onCreate(), cannot setup");
                return;
            }

            cachedWebView = webView;
            Log.d(TAG, "WebView found, configuring...");

            // 1. Enable pinch-to-zoom
            android.webkit.WebSettings webSettings = webView.getSettings();
            if (webSettings != null) {
                webSettings.setSupportZoom(true);
                webSettings.setBuiltInZoomControls(false);
                webSettings.setDisplayZoomControls(false);
                Log.d(TAG, "Pinch-to-zoom enabled");
            }

            // 2. Forward window insets to the web layer
            setupInsetsForwarding(webView);

            // 3. Register the JavaScript bridge for fullscreen control
            // The JS interface persists across page loads, so the web app
            // can call AndroidFullscreenHandler.enterFullscreen() / exitFullscreen()
            // at any time from main.tsx
            setupFullscreenBridge(webView);

            Log.d(TAG, "WebView setup complete");
        } catch (Throwable t) {
            Log.w(TAG, "Failed to setup WebView", t);
        }
    }

    /**
     * Forward Android WindowInsets to the web layer as a custom DOM event
     * so the web UI can adjust paddings for system bars / gesture areas.
     */
    private void setupInsetsForwarding(final android.webkit.WebView webView) {
        this.getWindow().getDecorView().setOnApplyWindowInsetsListener(
            new android.view.View.OnApplyWindowInsetsListener() {
                @Override
                public android.view.WindowInsets onApplyWindowInsets(
                        android.view.View v, android.view.WindowInsets insets) {
                    final int top = insets.getSystemWindowInsetTop();
                    final int bottom = insets.getSystemWindowInsetBottom();
                    Log.d(TAG, "WindowInsets changed: top=" + top + ", bottom=" + bottom);

                    lastInsetTop = top;
                    lastInsetBottom = bottom;

                    dispatchInsetsToWebView(webView, top, bottom);
                    return insets;
                }
            }
        );
        this.getWindow().getDecorView().requestApplyInsets();
    }

    /**
     * Register the AndroidFullscreenHandler JavaScript interface.
     * The web layer (main.tsx) calls enterFullscreen()/exitFullscreen()
     * when it detects fullscreen changes via the Fullscreen API.
     */
    private void setupFullscreenBridge(final android.webkit.WebView webView) {
        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void enterFullscreen() {
                Log.d(TAG, "JS bridge: enterFullscreen() called");
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        enterImmersiveMode();
                    }
                });
            }

            @android.webkit.JavascriptInterface
            public void exitFullscreen() {
                Log.d(TAG, "JS bridge: exitFullscreen() called");
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        exitImmersiveMode();
                    }
                });
            }
        }, "AndroidFullscreenHandler");
        Log.d(TAG, "AndroidFullscreenHandler JS interface registered");
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
                        Log.d(TAG, "Dispatched insets to JS: top=" + top + ", bottom=" + bottom);
                    } catch (Throwable t) {
                        Log.w(TAG, "Failed to dispatch insets to JS", t);
                    }
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "Failed to post insets dispatch", t);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-request window insets when app regains focus
        try {
            this.getWindow().getDecorView().requestApplyInsets();
            Log.d(TAG, "onResume: requested window insets");

            // Re-dispatch cached insets after a short delay
            if (cachedWebView != null && (lastInsetTop > 0 || lastInsetBottom > 0)) {
                cachedWebView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        Log.d(TAG, "onResume: re-dispatching cached insets after delay");
                        dispatchInsetsToWebView(cachedWebView, lastInsetTop, lastInsetBottom);
                    }
                }, 100);
            }
        } catch (Throwable t) {
            Log.w(TAG, "onResume: failed to request insets", t);
        }
    }

    @Override
    public void onBackPressed() {
        try {
            android.webkit.WebView webView = findWebView();
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
        } catch (Throwable t) {
            Log.w(TAG, "Error while trying to navigate webview history", t);
        }
        super.onBackPressed();
    }

    // ─── Immersive mode (hide system bars for video fullscreen) ───

    private void enterImmersiveMode() {
        isVideoFullscreen = true;
        applyImmersiveMode();
    }

    /**
     * Apply immersive mode flags. Separated from enterImmersiveMode() so it
     * can be re-applied from onWindowFocusChanged / onConfigurationChanged
     * without toggling the isVideoFullscreen flag.
     */
    private void applyImmersiveMode() {
        Log.d(TAG, "Applying immersive mode");

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                // Bars can appear temporarily on edge swipe, then auto-hide
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void exitImmersiveMode() {
        if (isVideoFullscreen) {
            isVideoFullscreen = false;
            Log.d(TAG, "Exiting immersive mode");

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.show(WindowInsets.Type.systemBars());
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                );
            }

            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && isVideoFullscreen) {
            // Re-apply immersive mode after focus changes (e.g. notification shade)
            applyImmersiveMode();
        }
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (isVideoFullscreen) {
            applyImmersiveMode();
        }
    }
}
