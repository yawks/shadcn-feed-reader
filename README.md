# Shadcn Feed Reader

A complete, modern Nextcloud News client built with Tauri v2 for desktop and Android. Both native targets run the same React frontend, Tauri commands and local Rust article proxy. The optional web/server build remains available without being required by the native applications.

## Features

### Core Capabilities
- **Complete Feed Management**: View your feeds and articles, organized by folders.
- **Feed Administration**: Add new feeds, remove existing ones, and move feeds between folders easily.
- **Filtering**: Advanced filtering options to find the content you care about.
- **Cross-Platform**: Available for both Desktop (macOS, Windows, Linux via Tauri) and Android.

### Advanced Reading Features
- **Integrated Article Reader**: Read full article content directly within the application without leaving the app.
- **Custom View Modes**: Switch between different viewing modes to get the best reading experience.
- **HTML Element Targeting**: Configure custom view modes by targeting specific HTML elements (CSS selectors) to extract exactly what you want to see from a webpage.
- **Paywall Access**: Configure authentication credentials for specific websites to access articles behind paywalls directly within the reader.
- **Settings Management**: Easily export and import your application settings and configurations.

## Prerequisites

Before building the application, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or newer)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)

### Platform-Specific Dependencies

#### macOS
Install Xcode Command Line Tools:
```bash
xcode-select --install
```

#### Android
Android development requires specific setup:
1.  **Android Studio**: Download and install [Android Studio](https://developer.android.com/studio).
2.  **SDK & NDK**: Follow the [Tauri Android Guide](https://v2.tauri.app/start/prerequisites/#android) to configure your environment (`ANDROID_HOME`, `NDK_HOME`, etc.).

## Installation

Clone the repository and install dependencies:

```bash
git clone <REPO_URL>
cd shadcn-feed-reader
pnpm install
```

## Development

Run the application in development mode with hot-reloading:

```bash
pnpm tauri dev
```

## Building

### Desktop (macOS)
Build the release bundle:
```bash
pnpm tauri build
```
Output location: `src-tauri/target/release/bundle/macos/`

### Android

The generated Android Studio project is versioned under `src-tauri/gen/android`, so initialization is only needed again when intentionally regenerating it.

1.  **Run on a connected device or emulator**:
    ```bash
    pnpm tauri:android:dev
    ```

2.  **Build a debug APK for ARM64 devices**:
    ```bash
    pnpm tauri:android:build:debug
    ```
    Output: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

3.  **Build a release AAB for Google Play**:
    ```bash
    pnpm tauri:android:build
    ```
    Configure the release keystore before distribution.

### Shared native architecture

The frontend always calls the native backend through `safeInvoke`. On desktop and Android, these calls reach the commands registered in `src-tauri/src/lib.rs`. The commands use the single proxy implementation in `src-tauri/src/proxy.rs`; there is no Android-specific HTTP proxy or Java/Kotlin article extraction plugin.

The proxy binds only to the device loopback on a random port. Android's network security configuration permits clear-text HTTP only for `localhost` and `127.0.0.1`; remote traffic remains HTTPS-first and is performed by Rust using Rustls.

The PWA/Docker path continues to use the HTTP API exposed by `shadcn-feed-server` as a compatibility target.
