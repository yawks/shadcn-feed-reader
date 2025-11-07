#!/bin/bash
# Script pour voir les logs Android facilement

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
    echo "Installez Android SDK ou ajoutez adb au PATH"
    exit 1
fi

echo "✅ Utilisation de: $ADB_PATH"
echo ""

# Vérifier que l'appareil est connecté
echo "📱 Vérification de la connexion..."
DEVICES=$($ADB_PATH devices | grep -v "List" | grep "device$" | wc -l | tr -d ' ')

if [ "$DEVICES" -eq "0" ]; then
    echo "❌ Aucun appareil Android connecté"
    echo ""
    echo "Vérifiez que:"
    echo "  1. Votre téléphone est connecté via USB"
    echo "  2. Le débogage USB est activé sur votre téléphone"
    echo "  3. Vous avez autorisé l'ordinateur sur votre téléphone"
    exit 1
fi

echo "✅ Appareil connecté"
echo ""
echo "🔍 Affichage des logs pour le mode de vue..."
echo "   (Appuyez sur Ctrl+C pour arrêter)"
echo ""
echo "=== LOGS ==="
echo ""

# Nettoyer les logs existants
$ADB_PATH logcat -c

# Afficher les logs filtrés
# D'abord tous les logs Capacitor/Console (pour voir les logs JavaScript)
# Puis filtrer pour les logs spécifiques au mode de vue
echo "📋 Affichage de TOUS les logs JavaScript (Capacitor/Console)..."
echo "   Cherchez les lignes avec [FeedArticle] ou [article-view-storage]"
echo ""
$ADB_PATH logcat | grep -E "Capacitor/Console.*FeedArticle|Capacitor/Console.*article-view-storage|Capacitor/Console.*viewMode|Capacitor/Console.*view.*mode|Capacitor/Console.*Loading view|Capacitor/Console.*Saving view|Capacitor/Console.*handleViewModeChange" --line-buffered
