#!/usr/bin/env bash
# sync-basemap-assets.sh
#
# Mirrors protomaps/basemaps-assets (sprites + Noto Sans glyph PBFs) to our
# own R2 bucket so /map doesn't depend on protomaps.github.io (rate-limited
# GitHub Pages, disallowed by TOS for primary infra).
#
# Output URL once synced:
#   https://tiles.queer.guide/basemaps-assets/sprites/v4/light{,@2x}.{json,png}
#   https://tiles.queer.guide/basemaps-assets/fonts/{fontstack}/{range}.pbf
#
# After sync, set the build env so MapLibre style points at the mirror:
#   VITE_BASEMAP_ASSETS_URL=https://tiles.queer.guide/basemaps-assets
#
# Re-run on protomaps version bumps. Match @protomaps/basemaps in
# package.json — currently ^5.7.0 → upstream tag v5.7.0.

set -euo pipefail

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

# Glyph PBFs — every fontstack, every range.
find fonts -type f -name '*.pbf' | while read -r f; do
  upload "$f" "$f" "application/x-protobuf"
done

echo "==> Done. Tile worker route /basemaps-assets/* must be wired to serve"
echo "    from this R2 prefix. See Dev/tiles-worker."

rm -rf "${WORKDIR}"
