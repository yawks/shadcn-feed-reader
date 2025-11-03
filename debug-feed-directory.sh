#!/bin/bash
# Script pour débugger le FeedDirectory sur Android

echo "🔍 Démarrage du monitoring des logs Android..."
echo "📱 Ouvrez l'application et essayez d'accéder au Feed Directory"
echo ""
echo "=== LOGS CAPACITOR & JAVASCRIPT ==="
echo ""

adb logcat -c
adb logcat | grep -E "Capacitor|chromium|Console|fetchRawHtml|RawHtml|Failed to load|feed directory|FeedDirectory|CORS|Network"
