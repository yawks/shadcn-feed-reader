# Shadcn Feed Reader

A complete, modern Nextcloud News client built for Desktop (using Tauri) and Android. This application provides a seamless reading experience with advanced features for article consumption and feed management.

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

1.  **Initialize Android Project** (First time only):
    ```bash
    pnpm tauri android init
    ```

2.  **Build APK/AAB**:
    ```bash
    pnpm tauri android build
    ```
    Output location: `src-tauri/gen/android/app/build/outputs/apk/release/`