#!/bin/bash

echo "🧹 Nettoyage complet..."

# 1. Nettoyer le build web
echo "1️⃣ Nettoyage du build web..."
rm -rf dist/
rm -rf node_modules/.vite/

# 2. Nettoyer le build Android
echo "2️⃣ Nettoyage du build Android..."
cd android
./gradlew clean
rm -rf app/build
rm -rf build
cd ..

# 3. Synchroniser Capacitor
echo "3️⃣ Synchronisation Capacitor..."
npx cap sync android

# 4. Rebuild l'app web
echo "4️⃣ Build de l'app web..."
npm run build

# 5. Copier vers Android
echo "5️⃣ Copie vers Android..."
npx cap copy android

echo ""
echo "✅ Nettoyage et rebuild terminés!"

# 2. Builder et installer
cd android && ./gradlew installDebug

echo "✅ Build et installation terminés! à $(date)"