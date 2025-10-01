# Shadcn Admin - Tauri

Ceci est la version de bureau de l'application Shadcn Admin, construite avec [Tauri](https://tauri.app/).

## Prérequis

Avant de commencer, vous devez avoir les outils suivants installés sur votre système :

- [Node.js](https://nodejs.org/) (v18 ou plus récent)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)

### Dépendances spécifiques à la plateforme

#### Pour macOS

Vous devez installer les outils de ligne de commande Xcode :

```bash
xcode-select --install
```

#### Pour Android

Le développement Android nécessite une configuration plus complexe. Vous devrez installer et configurer :

1.  **Android Studio** : Téléchargez et installez [Android Studio](https://developer.android.com/studio).
2.  **SDK et NDK Android** : Suivez les instructions de la [documentation officielle de Tauri](https://v2.tauri.app/start/prerequisites/#android) pour configurer correctement votre environnement de développement Android. Cela inclut la configuration des variables d'environnement comme `ANDROID_HOME` et `NDK_HOME`.

## Installation

Clonez le dépôt et installez les dépendances JavaScript :

```bash
git clone <URL_DU_REPO>
cd shadcn-admin-tauri
pnpm install
```

## Développement

Pour lancer l'application en mode développement avec rechargement à chaud :

```bash
pnpm tauri dev
```

Cela ouvrira une fenêtre de bureau avec votre application.

## Construire l'application

### Pour macOS

Pour construire l'application de bureau pour macOS, exécutez la commande suivante :

```bash
pnpm tauri build
```

L'application compilée se trouvera dans le répertoire `src-tauri/target/release/bundle/macos/`.

### Pour Android

1.  **Initialiser le projet Android** (à ne faire qu'une seule fois) :
    Cette commande va générer les fichiers de projet Android nécessaires dans `src-tauri/gen/android`.

    ```bash
    pnpm tauri android init
    ```

2.  **Construire l'application Android** :
    Pour construire le paquet APK ou AAB, exécutez :

    ```bash
    pnpm tauri android build
    ```

    Le paquet compilé se trouvera dans `src-tauri/gen/android/app/build/outputs/apk/release/` ou un chemin similaire. Vous pouvez également ouvrir le projet `src-tauri/gen/android` dans Android Studio pour construire et gérer votre application.