#!/usr/bin/env bash
# queer.guide — Static export orchestrator
# Builds the SPA, pre-renders public routes, and optionally deploys to mirrors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== queer.guide Static Export ==="
echo ""

# Step 1: Build the SPA
echo "[1/3] Building SPA..."
cd "$WEB_DIR"
npm run build
echo "    dist/ ready."

# Step 2: Pre-render public routes
echo "[2/3] Pre-rendering static pages..."
node scripts/prerender.mjs
echo "    dist-static/ ready."

# Step 3: Optional deployments
DIST_STATIC="$WEB_DIR/dist-static"

if [[ "${DEPLOY_INFOMANIAK:-}" == "true" ]]; then
    echo "[3a] Deploying to Infomaniak (Switzerland)..."
    rsync -avz --delete \
        "$DIST_STATIC/" \
        "${INFOMANIAK_USER:-8s0af_kwiir_ruben}@${INFOMANIAK_HOST:-8s0af.ftp.infomaniak.com}:${INFOMANIAK_WEB_ROOT:-~/sites/ch.queer.guide}/"
    echo "    Swiss mirror updated."
fi

if [[ "${DEPLOY_IPFS:-}" == "true" ]]; then
    echo "[3c] Deploying to IPFS..."
    bash "$SCRIPT_DIR/ipfs/deploy-ipfs.sh" "$DIST_STATIC"
    echo "    IPFS deployment complete."
fi

echo ""
echo "=== Export complete ==="
echo "Static site: $DIST_STATIC"
