import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { trimTrailingSlashes } from './trim-trailing-slashes.ts'

Deno.test('trimTrailingSlashes strips every trailing slash and nothing else', () => {
  const cases: Array<[string, string]> = [
    ['', ''],
    ['/', ''],
    ['///', ''],
    ['https://img.queer.guide', 'https://img.queer.guide'],
    ['https://img.queer.guide//', 'https://img.queer.guide'],
    ['/a/b/', '/a/b'],
    ['a/b/c', 'a/b/c'],
  ]
  for (const [input, expected] of cases) assertEquals(trimTrailingSlashes(input), expected)
})

Deno.test('trimTrailingSlashes is linear on a long non-terminal run of slashes', () => {
  const evil = '/'.repeat(200_000) + 'x'
  const t0 = performance.now()
  assertEquals(trimTrailingSlashes(evil), evil)
  if (performance.now() - t0 > 100) throw new Error('trimTrailingSlashes is not linear')
})
