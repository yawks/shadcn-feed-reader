#!/bin/bash

# Script pour voir TOUS les logs JavaScript (plus verbeux mais complet)

echo "=== TOUS les logs JavaScript (Capacitor/Console) ==="
echo ""
echo "Cherchez les lignes contenant:"
echo "  - [useIsMobile]"
echo "  - [Feeds]"
echo "  - [FeedArticle]"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""

# Nettoyer les logs existants
adb logcat -c

# Afficher TOUS les logs Capacitor/Console (les console.log JavaScript)
adb logcat | grep "Capacitor/Console" --line-buffered

