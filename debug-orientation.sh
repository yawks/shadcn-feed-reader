#!/bin/bash

# Script pour voir les logs de débogage liés à l'orientation et au layout mobile

echo "=== Logs de débogage pour l'orientation et le layout mobile ==="
echo ""
echo "Les logs JavaScript sur Android sont capturés avec le tag 'Capacitor/Console'"
echo ""
echo "Filtres appliqués:"
echo "  - useIsMobile: logs de détection mobile"
echo "  - Feeds: logs de changement de layout"
echo "  - FeedArticle: logs de rechargement d'article"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""

# Filtrer les logs de l'application
adb logcat -c  # Clear les logs existants

# Sur Android/Capacitor, les console.log sont capturés avec le tag "Capacitor/Console"
# On filtre pour voir uniquement nos logs de debug
adb logcat | grep -E "Capacitor/Console.*\[(useIsMobile|Feeds|FeedArticle)\]" --line-buffered

