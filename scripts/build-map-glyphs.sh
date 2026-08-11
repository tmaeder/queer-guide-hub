#!/usr/bin/env bash
# build-map-glyphs.sh
#
# Builds MapLibre SDF glyph PBFs for Space Grotesk, so the BASEMAP's own labels
# (city names, country names, road names, ocean labels) use the product
# typeface instead of Noto Sans.
#
# Output: OUT_DIR/fonts/Space Grotesk {Regular,Bold}/{start}-{end}.pbf
#
# Those directory names are not cosmetic — they are the fontstack names the
# style asks for, and they must match BRAND_FONTS in src/config/mapStyle.ts
# exactly. MapLibre requests `${ASSETS_BASE}/fonts/{fontstack}/{range}.pbf`; if
# a stack 404s, MapLibre drops EVERY label on the map rather than falling back,
# which is why mapStyle.ts only claims these fonts when
# VITE_BASEMAP_ASSETS_URL is set (i.e. when we're serving our own mirror that
# has them).
#
# Why not reuse public/fonts/space-grotesk/*.woff2: SDF generation needs a
# TTF/OTF; woff2 is compressed and fontnik can't read it. We pull the upstream
# variable font and instance it instead of round-tripping our web fonts.
#
# FALLBACK_DIR (2nd arg) should point at a Noto Sans glyph tree
# (basemaps-assets/fonts). Space Grotesk covers Latin, Latin-Ext and Vietnamese
# and nothing else — without compositing, every Cyrillic / Greek / Arabic / CJK
# place name on the map would render as blank space, and this app ships 11
# locales. MapLibre CAN request a multi-font stack, but it does so as a single
# comma-joined path (`A,B/0-255.pbf`) that only a compositing glyph server can
# answer; ours is static files on R2. So the fallback is baked in here instead:
# each range is Space Grotesk composited OVER Noto, emitted under the single
# stack name the style asks for.
#
# Requires: python3 + fonttools (`pip install fonttools brotli`), npx.
#
#   ./scripts/build-map-glyphs.sh [OUT_DIR] [FALLBACK_DIR]

set -euo pipefail

OUT_DIR="${1:-$(pwd)/.map-glyphs}"
FALLBACK_DIR="${2:-}"
WORKDIR="$(mktemp -d -t map-glyphs-XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

# Space Grotesk, SIL OFL 1.1 — same family as public/fonts/space-grotesk.
SRC_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf"

echo "==> Downloading Space Grotesk variable font"
curl -fsSL "${SRC_URL}" -o "${WORKDIR}/SpaceGrotesk.ttf"

# The upstream file is a variable font. fontnik renders a single static
# instance, so pin the two weights the style asks for explicitly rather than
# letting it pick the default instance for both.
echo "==> Instancing static weights (400, 700)"
python3 -m fontTools.varLib.instancer \
  "${WORKDIR}/SpaceGrotesk.ttf" wght=400 \
  -o "${WORKDIR}/SpaceGrotesk-Regular.ttf" >/dev/null
python3 -m fontTools.varLib.instancer \
  "${WORKDIR}/SpaceGrotesk.ttf" wght=700 \
  -o "${WORKDIR}/SpaceGrotesk-Bold.ttf" >/dev/null

if [ -n "${FALLBACK_DIR}" ]; then
  echo "==> Installing glyph compositor"
  npm install --silent --no-audit --no-fund --prefix "${WORKDIR}" \
    @mapbox/glyph-pbf-composite@0.0.3 >/dev/null
fi

build_stack() {
  local ttf="$1" stack="$2" fallback="$3"
  local dest="${OUT_DIR}/fonts/${stack}"
  echo "==> Building SDF ranges for '${stack}'"
  mkdir -p "${dest}"
  # 0–65535 in 256-codepoint ranges, the layout MapLibre requests.
  # `-p` is required: the package is `fontnik`, the executable is
  # `build-glyphs`, and npx cannot infer one from the other.
  npx --yes -p fontnik@0.7.7 build-glyphs "${ttf}" "${dest}"

  if [ -n "${FALLBACK_DIR}" ]; then
    if [ ! -d "${FALLBACK_DIR}/${fallback}" ]; then
      echo "!!! fallback stack missing: ${FALLBACK_DIR}/${fallback}" >&2
      exit 1
    fi
    echo "    compositing over '${fallback}'"
    # NODE_PATH, not `npx -p … node -e`: npx only puts the package's *bins* on
    # PATH, so a `require()` from an -e script still can't resolve it.
    STACK="${stack}" PRIMARY="${dest}" FALLBACK="${FALLBACK_DIR}/${fallback}" \
      NODE_PATH="${WORKDIR}/node_modules" node -e '
        const fs = require("fs");
        const path = require("path");
        const composite = require("@mapbox/glyph-pbf-composite");
        const { STACK, PRIMARY, FALLBACK } = process.env;
        let merged = 0;
        for (const f of fs.readdirSync(PRIMARY)) {
          if (!f.endsWith(".pbf")) continue;
          const back = path.join(FALLBACK, f);
          if (!fs.existsSync(back)) continue;
          // Array order is glyph priority: brand first, Noto fills the gaps.
          const out = composite.combine(
            [fs.readFileSync(path.join(PRIMARY, f)), fs.readFileSync(back)],
            STACK,
          );
          fs.writeFileSync(path.join(PRIMARY, f), out);
          merged++;
        }
        console.log(`    composited ${merged} ranges`);
      '
  fi
}

# Noto Sans Medium is what Protomaps uses for its "bold" slot, so that is the
# right fallback for our Bold stack — not Noto Sans Bold, which basemaps-assets
# does not ship.
build_stack "${WORKDIR}/SpaceGrotesk-Regular.ttf" "Space Grotesk Regular" "Noto Sans Regular"
build_stack "${WORKDIR}/SpaceGrotesk-Bold.ttf" "Space Grotesk Bold" "Noto Sans Medium"

echo "==> Done: ${OUT_DIR}/fonts/"
find "${OUT_DIR}/fonts" -name '*.pbf' | wc -l | xargs echo "    PBF files:"
