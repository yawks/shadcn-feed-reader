# Guide de débogage - FeedDirectoryDialog sur Android

## 🔍 Étapes pour diagnostiquer le problème

### 1. Préparer l'environnement de débogage

```bash
# Vérifier qu'un appareil Android est connecté
adb devices

# Nettoyer les logs existants
adb logcat -c
```

### 2. Lancer le monitoring des logs

Utilisez l'une de ces commandes pour voir les logs en temps réel :

#### Option A : Logs complets de l'application
```bash
adb logcat | grep -E "Capacitor|chromium|Console"
```

#### Option B : Logs ciblés sur le FeedDirectory
```bash
adb logcat | grep -iE "useFeedDirectory|fetchRawHtml|RawHtml|Failed to load|feed directory"
```

#### Option C : Utiliser le script fourni
```bash
./debug-feed-directory.sh
```

### 3. Reproduire le problème

1. Ouvrez l'application FeedReader sur votre appareil Android
2. Essayez d'ouvrir le Feed Directory Dialog
3. Observez les logs dans le terminal

### 4. Logs à rechercher

Les logs ajoutés commencent par `[useFeedDirectory]` et suivent ce pattern :

```
✓ Succès : [useFeedDirectory] ✓ fetchRawHtml SUCCESS
✗ Erreur  : [useFeedDirectory] ✗ ERROR:
```

### 5. Vérifier que le plugin RawHtml est chargé

Recherchez dans les logs au démarrage de l'app :

```bash
adb logcat | grep -i "RawHtmlPlugin"
```

Vous devriez voir :
```
D MainActivity: Registering RawHtmlPlugin BEFORE onCreate...
D MainActivity: RawHtmlPlugin registered, calling super.onCreate()...
```

### 6. Tester manuellement le plugin

Vous pouvez tester si le plugin fonctionne en ouvrant la console Chrome DevTools :

1. Sur votre ordinateur, ouvrez Chrome
2. Allez sur `chrome://inspect`
3. Trouvez votre appareil et cliquez sur "inspect"
4. Dans la console, tapez :

```javascript
// Vérifier que le plugin est disponible
console.log('RawHtml plugin:', window.Capacitor?.Plugins?.RawHtml)

// Tester le plugin
if (window.Capacitor?.Plugins?.RawHtml) {
  window.Capacitor.Plugins.RawHtml.fetchRawHtml({ 
    url: 'https://atlasflux.saynete.net/base_xml' 
  }).then(result => {
    console.log('✓ Plugin test SUCCESS, length:', result.html.length)
  }).catch(err => {
    console.error('✗ Plugin test FAILED:', err)
  })
}
```

### 7. Vérifier la configuration du plugin

Le plugin doit être enregistré dans `MainActivity.java` :

```java
registerPlugin(RawHtmlPlugin.class);
```

### 8. Rebuilder l'application après les modifications

```bash
# 1. Reconstruire le projet web
pnpm run build

# 2. Synchroniser avec Capacitor
npx cap sync android

# 3. Ouvrir dans Android Studio pour rebuild
npx cap open android

# Ou directement depuis le terminal
cd android && ./gradlew assembleDebug
```

### 9. Erreurs communes et solutions

#### Erreur : "RawHtml plugin not available"
**Cause** : Le plugin n'est pas correctement enregistré ou compilé
**Solution** : 
- Vérifier que `registerPlugin(RawHtmlPlugin.class)` est dans `MainActivity.java`
- Rebuilder le projet Android complètement

#### Erreur : "Failed to fetch: Network error"
**Cause** : Problème de connectivité ou CORS
**Solution** : 
- Vérifier que l'appareil a accès à Internet
- Le plugin devrait contourner CORS automatiquement

#### Erreur : "Tauri invoke not available"
**Cause** : Le code essaie d'utiliser Tauri sur Android
**Solution** : 
- S'assurer que `fetchRawHtml` de `@/lib/raw-html` est utilisé (pas `safeInvoke`)

### 10. Logs détaillés du plugin Java

Si vous voulez voir les logs internes du plugin Java, modifiez `RawHtmlPlugin.java` pour ajouter plus de logs :

```java
@PluginMethod
public void fetchRawHtml(PluginCall call) {
    String url = call.getString("url");
    Log.d(TAG, "fetchRawHtml called with URL: " + url);
    
    // ... reste du code
    
    Log.d(TAG, "fetchRawHtml SUCCESS, body length: " + body.length());
}
```

Puis recherchez ces logs :
```bash
adb logcat | grep "RawHtmlPlugin"
```

## 📊 Commandes utiles supplémentaires

```bash
# Voir tous les logs de l'application (filtré par package)
adb logcat | grep "$(adb shell ps | grep feedreader | awk '{print $2}')"

# Sauvegarder les logs dans un fichier
adb logcat > feed-directory-logs.txt

# Voir uniquement les erreurs
adb logcat *:E | grep -i feedreader

# Voir les logs en temps réel avec horodatage
adb logcat -v time | grep -E "Capacitor|Console"
```

## 🎯 Checklist de vérification

- [ ] L'appareil Android est connecté (`adb devices`)
- [ ] Le plugin RawHtml est enregistré dans MainActivity.java
- [ ] Le code utilise `fetchRawHtml` de `@/lib/raw-html` (pas `safeInvoke`)
- [ ] L'application a été rebuildée après les modifications
- [ ] Les logs montrent que le plugin est chargé au démarrage
- [ ] Chrome DevTools est connecté pour voir les logs JavaScript
- [ ] Les logs `[useFeedDirectory]` sont visibles dans la console

## 🔧 Si ça ne fonctionne toujours pas

Partagez les informations suivantes :
1. Les logs complets depuis l'ouverture du FeedDirectory Dialog
2. Le résultat de la commande : `adb logcat | grep RawHtmlPlugin`
3. Le résultat du test manuel dans Chrome DevTools
4. Le message d'erreur exact affiché dans l'UI
