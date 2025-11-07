#!/bin/bash
# Script pour débugger le mode de vue des articles sur Android

echo "🔍 Démarrage du monitoring des logs Android pour le mode de vue..."
echo "📱 Ouvrez l'application et changez le mode de vue d'un article"
echo ""
echo "=== LOGS MODE DE VUE ==="
echo ""

# Nettoyer les logs existants
adb logcat -c

# Filtrer les logs pour voir uniquement ceux liés au mode de vue
adb logcat | grep -E "FeedArticle|article-view-storage|view.*mode|readability|original|dark"
