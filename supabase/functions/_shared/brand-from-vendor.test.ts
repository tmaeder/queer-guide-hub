import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { brandFromVendor } from './marketplace-pipeline-utils.ts'

// Every "junk" string below is a real `marketplace_listings.brand` value measured
// on prod 2026-09-16, and every "real" one is a real brand in the same table.
// The point of the guard is that these two sets are separated by "has a word in
// it", not by "has digits in it" — several real brands are mostly digits.

Deno.test('a vendor with no letter falls back to the merchant', () => {
  for (const junk of [
    '12807-204144345',
    '12807 204441904', // space, not a hyphen — an earlier regex missed this one
    '‭1280-7204244927‬', // carries bidi control characters
    '19868-001638740',
    '10819-50013638-8',
    '9781728209982', // an ISBN-13 in a bookshop feed's author field
  ]) {
    assertEquals(brandFromVendor(junk, 'GARÇON'), 'GARÇON', junk)
  }
})

Deno.test('a real brand name is passed through untouched, digits and all', () => {
  // If any of these ever fall back, the guard has started eating real brands.
  for (const real of [
    'GARÇON',
    'Garçon Model',
    '1979 SAS (Teil der Marc Dorcel Group)', // starts with a year
    '2(X)IST',
    'b-Vibe',
    'gc2b',
    'RUFSKIN®',
    'Marek+Richard',
    '東京', // \p{L}, not [a-z] — this is why
    'Åberg Atelier',
  ]) {
    assertEquals(brandFromVendor(real, 'FALLBACK'), real, real)
  }
})

Deno.test('empty and missing vendors take the fallback', () => {
  assertEquals(brandFromVendor('', 'Queer Lit'), 'Queer Lit')
  assertEquals(brandFromVendor('   ', 'Queer Lit'), 'Queer Lit')
  assertEquals(brandFromVendor(null, 'Queer Lit'), 'Queer Lit')
  assertEquals(brandFromVendor(undefined, 'Queer Lit'), 'Queer Lit')
})

Deno.test('the vendor is trimmed, so whitespace cannot fork a brand key', () => {
  assertEquals(brandFromVendor('  GARÇON  ', 'x'), 'GARÇON')
})

Deno.test('a useless fallback never reinstates the rejected vendor', () => {
  // The old chain was `ov.businessName || p.vendor || shopDomain`, which falls
  // back onto the very value being rejected. Returning the junk here would make
  // the guard a no-op on exactly the shops that need it, and silently.
  assertEquals(brandFromVendor('12807-204144345', ''), '12807-204144345')
  assertEquals(brandFromVendor('12807-204144345', null), '12807-204144345')
  // ...but it must not invent one either: with nothing to fall back to, the
  // original is still the only thing we know.
  assertEquals(brandFromVendor('12807-204144345', '   '), '12807-204144345')
})

Deno.test('a wrong-but-wordy vendor is deliberately NOT caught', () => {
  // "Shipping Protection" is a line item, not a brand, and it is still in the
  // catalogue. Telling it apart from a real brand needs judgement this function
  // does not have, and widening the predicate to catch it would start eating
  // real names. Recorded as a known gap rather than papered over.
  assertEquals(brandFromVendor('Shipping Protection', 'Garçon Model'), 'Shipping Protection')
})
