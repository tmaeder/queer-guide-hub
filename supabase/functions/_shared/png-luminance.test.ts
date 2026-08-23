import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { needsInkPlate, pngInk } from './png-luminance.ts'

/**
 * Fixtures are REAL PNGs, encoded by an actual encoder (Pillow) rather than
 * assembled by hand: a hand-built byte array would agree with a hand-built
 * parser about a format neither of them implements correctly.
 */
const FIXTURES = {
  // A white bar on transparency — the shape that renders as an empty plate.
  whiteOnTransparent:
    'iVBORw0KGgoAAAANSUhEUgAAADwAAAAeCAYAAABwmH1PAAAAP0lEQVR4nO3PsQ0AIAwDQcL+O4cBEGVACnetG/8YAADUiNOQmXnzSIWI2PrmiyMvCe5OcHeCuxPc3XfBAADXLCd4BBbxkb3QAAAAAElFTkSuQmCC',
  inkOnTransparent:
    'iVBORw0KGgoAAAANSUhEUgAAADwAAAAeCAYAAABwmH1PAAAARElEQVR4nO3PsQ0AIQwEQfgO3H+RLoEvABECkplJL7ltDQCAPfpqiIhx8sgOmTn1fTeO3CS4OsHVCa5OcHXPBQMAHPMDBLIEFo3m8TUAAAAASUVORK5CYII=',
  // No alpha channel at all: a mark on its own white field.
  inkOnWhiteRgb:
    'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAkElEQVR4nO3WQQ6AIAxEUTBegfsfkEPgwqUm/GkwNGa6NG2fhaDUMUbZEccW1bBhw7+Az0BNa+35sPcuNanSJ/OVjPHCUk9VmKPBvCPMRDBXef4cVlVYlfUcx8YltVknNmz4M1j95/DarBOX6NDTKjSxapN8utTchpnCHpOO/P20q88dG+5cCyPxcTJs2DCMCyX6M0OoFVJ+AAAAAElFTkSuQmCC',
  // Palette + tRNS, every visible entry light.
  paletteLight:
    'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAMAAAC7IEhfAAADAFBMVEX///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///r//vv//fz///3//v7//fX///b//vf//fj///n//vr//fv///z//v3//f7///X//vb//ff///j//vn//fr///v//vz//f3///7//vX//fb///f//vj//fn///qPY8F8AAABAHRSTlP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AU/cHJQAAAHdJREFUeJztylsSQgAAQFGr0Dsq0UtIEvvfVxZw7zR9mWnG+T7B50fBFP8ghrP5Yrlab7ZRvNsfkmOanTzynT3yXTzyXT3y3Tzy5R757h75Co98pUe+yiPfwyNf7ZHv6ZGv8cj38sjXeuR7e+TrPPL1Hr+a4shxAMAzCt1qpcZMAAAAAElFTkSuQmCC',
  // Grey + alpha, a dark mark.
  grayAlphaInk:
    'iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAQAAAAm93DmAAAAMUlEQVR4nO3OoRIAEABEwSP6/29VyYxiRLvxwptLAEiSsg9t3Cb60qgvb04EBQH+MQFUmwIS7x+bhgAAAABJRU5ErkJggg==',
  sixteenBit:
    'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUEAAAAAD4cp6SAAAAEElEQVR4nGNgGAWjYBSQAgADNAABbnWNbAAAAABJRU5ErkJggg==',
}

function bytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

Deno.test('a white-on-transparent wordmark reports NO dark ink', async () => {
  const ink = await pngInk(bytes(FIXTURES.whiteOnTransparent))
  assertEquals(ink?.darkFraction, 0)
  assertEquals(needsInkPlate(ink), true)
})

Deno.test('an ink-on-transparent wordmark is all dark ink', async () => {
  const ink = await pngInk(bytes(FIXTURES.inkOnTransparent))
  assertEquals(ink?.darkFraction, 1)
  assertEquals(needsInkPlate(ink), false)
})

Deno.test('a mark on its own white field counts only the mark as ink', async () => {
  // The white field is opaque, so most pixels are light — but the dark ellipse
  // is well clear of the 2% floor. This is the case a "mean luminance" test
  // would get wrong, and why the metric is a FRACTION of dark pixels.
  const ink = await pngInk(bytes(FIXTURES.inkOnWhiteRgb))
  assertEquals(ink !== null, true)
  assertEquals(ink!.darkFraction > 0.02 && ink!.darkFraction < 0.5, true)
  assertEquals(needsInkPlate(ink), false)
})

Deno.test('palette images are resolved through PLTE, not read as indices', async () => {
  // Without the palette lookup the raw bytes are 0 and 1 — which would read as
  // "almost entirely black" and put a light logo on an ink plate.
  const ink = await pngInk(bytes(FIXTURES.paletteLight))
  assertEquals(ink?.darkFraction, 0)
  assertEquals(needsInkPlate(ink), true)
})

Deno.test('greyscale + alpha is read', async () => {
  const ink = await pngInk(bytes(FIXTURES.grayAlphaInk))
  assertEquals(ink?.darkFraction, 1)
})

Deno.test('a 16-bit PNG is refused, not guessed at', async () => {
  assertEquals(await pngInk(bytes(FIXTURES.sixteenBit)), null)
})

Deno.test('an interlaced PNG is refused', async () => {
  // Pillow cannot WRITE Adam7, so this flips the interlace flag in IHDR of a
  // real PNG. That is exactly what the guard reads, and the decoder does not
  // verify CRCs, so nothing downstream is faked — it proves the flag is
  // honoured before any scanline is touched.
  const b = bytes(FIXTURES.inkOnTransparent)
  assertEquals((await pngInk(b))?.darkFraction, 1)
  b[8 + 8 + 12] = 1
  assertEquals(await pngInk(b), null)
})

Deno.test('a non-PNG is refused', async () => {
  assertEquals(await pngInk(new TextEncoder().encode('<svg xmlns="...">')), null)
  assertEquals(await pngInk(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), null)
})

Deno.test('an unreadable image never moves a logo onto ink', () => {
  // The default must be the paper plate: nearly every logo belongs there, and
  // a wrong ink plate erases a dark wordmark completely.
  assertEquals(needsInkPlate(null), false)
})
