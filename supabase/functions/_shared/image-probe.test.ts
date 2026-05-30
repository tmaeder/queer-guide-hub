import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { evaluateCover } from './image-probe.ts'

Deno.test('a full-size landscape passes as a cover', () => {
  assertEquals(evaluateCover({ width: 1600, height: 1000, bytes: 400_000 }, 'cover'), null)
})

Deno.test('rejects a small cover', () => {
  assertEquals(evaluateCover({ width: 120, height: 120, bytes: 8_000 }, 'cover'), 'cover_too_small')
})

Deno.test('rejects a portrait hero (passes size, fails ratio)', () => {
  assertEquals(evaluateCover({ width: 900, height: 1200, bytes: 300_000 }, 'hero'), 'cover_portrait')
})

Deno.test('rejects a near-solid-colour cover via bytes-per-pixel', () => {
  // 1200x800 PNG of a flat colour compresses to a few KB → very low bpp.
  assertEquals(evaluateCover({ width: 1200, height: 800, bytes: 3_000 }, 'cover'), 'near_solid_color')
})

Deno.test('gallery / thumbnail are not held to cover rules', () => {
  assertEquals(evaluateCover({ width: 120, height: 120, bytes: 5_000 }, 'gallery'), null)
  assertEquals(evaluateCover({ width: 300, height: 400 }, 'thumbnail'), null)
})

Deno.test('unknown dimensions are not penalised', () => {
  assertEquals(evaluateCover({}, 'cover'), null)
})
