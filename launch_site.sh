#!/bin/bash

cd "$(dirname "$0")" || exit 1

echo "SCEP Invaders - lanceur"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est introuvable : installez-le depuis https://nodejs.org puis relancez."
  exit 1
fi

# Vite 8 (via Rolldown) uses node:util.styleText, which is not available in
# the older Node.js 20.11 runtime. Keep the check here so the launcher fails
# with a useful message instead of a cryptic build-time ESM error.
NODE_VERSION=$(node -p 'process.versions.node')
IFS=. read -r NODE_MAJOR NODE_MINOR NODE_PATCH <<EOF
$NODE_VERSION
EOF

if ! { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -ge 19 ]; } \
  && ! { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -ge 12 ]; } \
  && [ "$NODE_MAJOR" -lt 23 ]; then
  echo "Version de Node.js incompatible : $NODE_VERSION"
  echo "Vite nécessite Node.js 20.19+ ou 22.12+ (ou une version plus récente)."
  echo "Mettez Node.js à jour, puis relancez ce script."
  exit 1
fi

needs_dependency_install() {
  [ ! -d "node_modules" ] && return 0

  # Rolldown uses a platform-specific optional package. npm can leave that
  # package out when node_modules was installed on another machine/platform.
  case "$(uname -s):$(uname -m)" in
    Darwin:arm64)
      [ ! -e "node_modules/@rolldown/binding-darwin-arm64/rolldown-binding.darwin-arm64.node" ]
      ;;
    Darwin:x86_64)
      [ ! -e "node_modules/@rolldown/binding-darwin-x64/rolldown-binding.darwin-x64.node" ]
      ;;
    *)
      return 1
      ;;
  esac
}

if needs_dependency_install; then
  echo "Installation/réparation des dépendances..."
  npm install --include=optional || {
    echo "Échec de l'installation."
    exit 1
  }
fi

# If npm reproduced its optional-dependency bug, rebuild the generated
# dependency directory while preserving package-lock.json.
if needs_dependency_install; then
  echo "Réinstallation des dépendances natives..."
  rm -rf node_modules
  npm install --include=optional || {
    echo "Échec de la réinstallation."
    exit 1
  }
fi

echo "Compilation du jeu de coinche..."
npm run build || {
  echo "Échec de la compilation."
  exit 1
}

echo "Démarrage du serveur de coinche (port 8001)..."
npm run server &
SERVER_PID=$!

echo "Démarrage du site (port 8000)..."
npx --yes serve site -l 8000 &
SITE_PID=$!

cleanup() {
  kill "$SERVER_PID" "$SITE_PID" 2>/dev/null
  exit 0
}

trap cleanup INT TERM

sleep 3
open "http://localhost:8000/coinche/"

echo
echo "Tout est lancé : site sur http://localhost:8000"
echo "Appuyez sur Ctrl+C pour tout arrêter."

wait
