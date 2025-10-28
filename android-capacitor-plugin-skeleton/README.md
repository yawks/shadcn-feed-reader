Capacitor Android plugin skeleton: RawHtml
=========================================

This folder contains a minimal skeleton for a Capacitor Android plugin that exposes a `fetchRawHtml(url)` method.

Purpose
- Provide a native fetch (OkHttp) so the WebView can request raw HTML bypassing CORS limitations.

How to integrate
1. After running `npx cap add android`, open the generated Android project in Android Studio.
2. Create the plugin Java/Kotlin class in your Android app module under `app/src/main/java/<your_package>/RawHtmlPlugin.kt`.
3. Register the plugin with Capacitor if needed (Capacitor will usually pick plugins included in the app module).
4. From your JS/TS code call the plugin via `Plugins.RawHtml.fetchRawHtml({ url })`.

Notes
- This is a skeleton: adjust package name, error handling and threading for your needs.
- We recommend using `OkHttp` and Kotlin coroutines to perform network calls off the main thread.
