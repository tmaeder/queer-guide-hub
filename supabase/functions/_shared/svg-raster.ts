/**
 * Rasterize an SVG logo to PNG so it can be mirrored to img.queer.guide.
 *
 * An SVG is never stored on img.queer.guide: opened directly it is a
 * script-capable document (which is why upload-image-r2 accepts raster types
 * only). Rendering it to PNG keeps the brand's real mark while the bytes we
 * serve can carry no script. It also lets `logo_on_ink` be measured, which
 * png-luminance.ts can only do on a PNG.
 *
 * Uses the same resvg-wasm build trip-og-image already runs in production.
 *
 * Refusals, all returned as a reason rather than thrown:
 *   svg_has_text     — resvg-wasm here has no fonts, so <text> would render as
 *                      nothing and the logo would lose its words silently
 *   svg_external_ref — an href to http(s): resvg never fetches it, so that part
 *                      of the mark would be missing
 *   svg_render_failed / svg_blank — the render threw, or came out with no
 *                      visible pixel (checked by the caller via pngInk)
 */
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2'

/** Longest side of the rendered PNG, in pixels. Plates are 56px; 512 leaves room for retina and the masthead. */
export const SVG_RASTER_MAX_SIDE = 512

let wasmReady: Promise<void> | null = null
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm')
      .then((r) => {
        if (!r.ok) throw new Error(`resvg wasm fetch ${r.status}`)
        return initWasm(r)
      })
      .catch((e) => {
        wasmReady = null // let the next call retry instead of caching the failure
        throw e
      })
  }
  return wasmReady
}

export type SvgRasterResult = { ok: true; png: Uint8Array } | { ok: false; reason: string }

/** Pre-render checks that need no wasm. Exported for tests. */
export function svgRasterRefusal(svg: string): string | null {
  if (/<text[\s>]/i.test(svg)) return 'svg_has_text'
  if (/(?:xlink:)?href\s*=\s*["']\s*https?:/i.test(svg)) return 'svg_external_ref'
  return null
}

export async function rasterizeSvg(bytes: Uint8Array, maxSide = SVG_RASTER_MAX_SIDE): Promise<SvgRasterResult> {
  const svg = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const refusal = svgRasterRefusal(svg)
  if (refusal) return { ok: false, reason: refusal }

  try {
    await ensureWasm()
    // Size by the longer side so a tall mark (The Handy is 363x534) is capped
    // the same way a wide wordmark is.
    const probe = new Resvg(svg)
    const tall = probe.height > probe.width
    probe.free()
    const resvg = new Resvg(svg, {
      fitTo: tall ? { mode: 'height', value: maxSide } : { mode: 'width', value: maxSide },
      background: 'rgba(0,0,0,0)',
    })
    const png = resvg.render().asPng()
    resvg.free()
    return { ok: true, png }
  } catch (e) {
    console.error(`[svg-raster] render failed: ${(e as Error).message}`)
    return { ok: false, reason: 'svg_render_failed' }
  }
}
