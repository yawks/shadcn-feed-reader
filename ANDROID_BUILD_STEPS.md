# Étapes finales pour tester l'APK Android avec le plugin RawHtml

## Ce qui a été fait
✅ Capacitor installé et configuré  
✅ Projet Android créé (`android/`)  
✅ Plugin `RawHtmlPlugin.kt` ajouté avec dépendances OkHttp  
✅ Plugin enregistré dans `MainActivity.java`  
✅ Wrapper `fetchRawHtml` mis à jour avec logs de debug  
✅ Assets web copiés vers Android  

## Prochaines étapes (à faire dans Android Studio)

### 1. Sync Gradle et Build
```bash
# Dans Android Studio:
File > Sync Project with Gradle Files
Build > Rebuild Project
```

### 2. Build et installer l'APK
```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 3. Lancer l'app et surveiller les logs
```bash
# Terminal 1 - Logs console JS (voir les logs fetchRawHtml)
adb logcat | grep "Capacitor/Console"

# Terminal 2 - Logs plugin Android
adb logcat | grep "RawHtmlPlugin"

# Terminal 3 - Tous les logs Capacitor
adb logcat | grep "Capacitor"
```

### 4. Tester dans l'app
- Ouvre l'app sur l'appareil/émulateur
- Navigue vers un article
- Sélectionne le mode "Readability"
- Observe les logs dans les terminaux

## Logs attendus

### Si le plugin fonctionne :
```
[fetchRawHtml] Checking for Capacitor plugin...
[fetchRawHtml] window.Capacitor: [Object]
[fetchRawHtml] window.Capacitor.Plugins: [Object]
[fetchRawHtml] Calling Capacitor RawHtml plugin for: https://...
[fetchRawHtml] Capacitor plugin returned: { html: "..." }
```

### Si le plugin n'est pas détecté :
```
[fetchRawHtml] Checking for Capacitor plugin...
[fetchRawHtml] Capacitor RawHtml plugin not found
[fetchRawHtml] Trying Tauri invoke for: https://...
[fetchRawHtml] Tauri invoke failed: ...
[fetchRawHtml] Falling back to regular fetch (may fail with CORS): https://...
```

## Dépannage

### Si le plugin n'est toujours pas détecté après Gradle sync
1. Vérifier que `RawHtmlPlugin.kt` est bien dans le bon package :
   - Chemin : `android/app/src/main/java/com/yourorg/feedreader/RawHtmlPlugin.kt`
   - Package dans le fichier : `package com.yourorg.feedreader`

2. Vérifier que les dépendances sont dans `app/build.gradle` :
   ```gradle
   implementation 'com.squareup.okhttp3:okhttp:4.12.0'
   implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
   ```

3. Vérifier que `MainActivity.java` enregistre le plugin :
   ```java
   registerPlugin(RawHtmlPlugin.class);
   ```

4. Clean & Rebuild :
   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleDebug
   ```

### Si CORS persiste sur desktop Tauri
Vérifier que tu lances bien l'app Tauri (pas le dev server web) :
```bash
pnpm tauri dev
# ou
pnpm tauri build
```

## Pour générer un APK release signé

### 1. Créer un keystore
```bash
keytool -genkey -v -keystore ~/my-release-key.keystore \
  -alias my_key_alias -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Configurer signing dans `android/app/build.gradle`
```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file("/path/to/my-release-key.keystore")
            storePassword "your-store-password"
            keyAlias "my_key_alias"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 3. Build release
```bash
cd android
./gradlew assembleRelease
# APK signé : app/build/outputs/apk/release/app-release.apk
```

## Commandes utiles

```bash
# Lister les appareils connectés
adb devices

# Désinstaller l'app
adb uninstall com.yourorg.feedreader

# Installer un APK
adb install -r path/to/app.apk

# Voir les logs en temps réel
adb logcat -c  # clear logs
adb logcat

# Filtrer par tag
adb logcat -s RawHtmlPlugin Capacitor
```
