import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { rasterizeSvg, svgRasterRefusal } from './svg-raster.ts'
import { pngInk, needsInkPlate } from './png-luminance.ts'
import { imageSize } from './site-icon.ts'

const enc = (s: string) => new TextEncoder().encode(s)

Deno.test('text and external references are refused before rendering', () => {
  assertEquals(svgRasterRefusal('<svg><text x="0">Brand</text></svg>'), 'svg_has_text')
  assertEquals(svgRasterRefusal('<svg><image href="https://cdn.example/a.png"/></svg>'), 'svg_external_ref')
  assertEquals(svgRasterRefusal('<svg><image xlink:href="data:image/png;base64,AAAA"/></svg>'), null)
  assertEquals(svgRasterRefusal('<svg><path d="M0 0h10v10z"/></svg>'), null)
})

// Network: fetches the resvg wasm from esm.sh, as the deployed function does.
Deno.test({
  name: 'a wide mark renders to a 512px-wide PNG whose polarity can be measured',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const dark = enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect x="10" y="10" width="180" height="30" fill="#222"/></svg>')
    const r = await rasterizeSvg(dark)
    assert(r.ok)
    assertEquals(imageSize(r.png), { width: 512, height: 128 })
    assertEquals(needsInkPlate(await pngInk(r.png)), false)

    // A white-only mark is the one that needs the ink plate, and it can only be
    // known after rendering.
    const white = enc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 200"><rect width="50" height="200" fill="#fff"/></svg>')
    const w = await rasterizeSvg(white)
    assert(w.ok)
    assertEquals(imageSize(w.png), { width: 128, height: 512 })
    assertEquals(needsInkPlate(await pngInk(w.png)), true)
  },
})
