#!/bin/bash
# Script pour voir TOUS les logs JavaScript sur Android

# Trouver adb automatiquement
ADB_PATH=""
if [ -f "$HOME/Library/Android/sdk/platform-tools/adb" ]; then
    ADB_PATH="$HOME/Library/Android/sdk/platform-tools/adb"
elif [ -f "$ANDROID_HOME/platform-tools/adb" ]; then
    ADB_PATH="$ANDROID_HOME/platform-tools/adb"
elif command -v adb &> /dev/null; then
    ADB_PATH="adb"
else
    echo "❌ Erreur: adb n'est pas trouvé"
    exit 1
fi

echo "✅ Utilisation de: $ADB_PATH"
echo ""

# Vérifier que l'appareil est connecté
DEVICES=$($ADB_PATH devices | grep -v "List" | grep "device$" | wc -l | tr -d ' ')
if [ "$DEVICES" -eq "0" ]; then
    echo "❌ Aucun appareil Android connecté"
    exit 1
fi

echo "✅ Appareil connecté"
echo ""
echo "🔍 Affichage de TOUS les logs JavaScript (Capacitor/Console)..."
echo "   Cherchez les lignes avec [FeedArticle] ou [article-view-storage]"
echo "   (Appuyez sur Ctrl+C pour arrêter)"
echo ""
echo "=== TOUS LES LOGS JAVASCRIPT ==="
echo ""

# Nettoyer les logs existants
$ADB_PATH logcat -c

# Afficher TOUS les logs Capacitor/Console
$ADB_PATH logcat | grep "Capacitor/Console" --line-buffered
