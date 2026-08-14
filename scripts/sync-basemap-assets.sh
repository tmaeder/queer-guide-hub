#!/usr/bin/env bash
# sync-basemap-assets.sh
#
# Mirrors protomaps/basemaps-assets (sprites + Noto Sans glyph PBFs) to our
# own R2 bucket so /map doesn't depend on protomaps.github.io (rate-limited
# GitHub Pages, disallowed by TOS for primary infra), AND builds the Space
# Grotesk glyph stacks the basemap's own labels use.
#
# Output URL once synced:
#   https://tiles.queer.guide/basemaps-assets/sprites/v4/light{,@2x}.{json,png}
#   https://tiles.queer.guide/basemaps-assets/fonts/{fontstack}/{range}.pbf
#     …including "Space Grotesk Regular" and "Space Grotesk Bold".
#
# After sync, set the build env so MapLibre style points at the mirror:
#   VITE_BASEMAP_ASSETS_URL=https://tiles.queer.guide/basemaps-assets
#
# That env var is load-bearing in BOTH directions: src/config/mapStyle.ts only
# asks for the Space Grotesk stacks when it is set, because a fontstack that
# 404s makes MapLibre drop every label on the map. So: run this script FIRST,
# then set the variable — never the other way round.
#
# Re-run on protomaps version bumps. Match @protomaps/basemaps in
# package.json — currently ^5.7.0 → upstream tag v5.7.0.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${1:-v5.7.0}"
BUCKET="${R2_BUCKET:-queer-guide-tiles}"
PREFIX="basemaps-assets"
WORKDIR="$(mktemp -d -t basemaps-assets-XXXXXX)"

echo "==> Cloning protomaps/basemaps-assets@${VERSION}"
git clone --depth 1 --branch "${VERSION}" \
  https://github.com/protomaps/basemaps-assets.git "${WORKDIR}/repo"

echo "==> Uploading sprites + fonts to R2: ${BUCKET}/${PREFIX}/"
cd "${WORKDIR}/repo"

upload() {
  local src="$1" dest="$2" ct="$3"
  echo "  $dest"
  npx wrangler r2 object put "${BUCKET}/${PREFIX}/${dest}" \
    --file "${src}" --content-type "${ct}"
}

# Sprites — both 1x and 2x, json + png, light + dark.
for variant in light dark; do
  for scale in "" "@2x"; do
    upload "sprites/v4/${variant}${scale}.json" "sprites/v4/${variant}${scale}.json" "application/json"
    upload "sprites/v4/${variant}${scale}.png"  "sprites/v4/${variant}${scale}.png"  "image/png"
  done
done

# Brand glyph stacks — built from the upstream Space Grotesk variable font and
# composited over the Noto ranges we just cloned, so non-Latin place names keep
# rendering. Emitted into the same `fonts/` tree so the upload below picks them
# up with everything else.
echo "==> Building Space Grotesk glyph stacks"
"${SCRIPT_DIR}/build-map-glyphs.sh" "${WORKDIR}/repo" "${WORKDIR}/repo/fonts"

# Glyph PBFs — every fontstack, every range.
find fonts -type f -name '*.pbf' | while read -r f; do
  upload "$f" "$f" "application/x-protobuf"
done

echo "==> Done. Tile worker route /basemaps-assets/* must be wired to serve"
echo "    from this R2 prefix. See Dev/tiles-worker."
echo "    Then set VITE_BASEMAP_ASSETS_URL and redeploy Pages."

rm -rf "${WORKDIR}"
