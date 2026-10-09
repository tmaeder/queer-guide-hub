import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyGeocodedCityName, isLatinName } from './admin-unit-name.ts'

// Every input below is a name backfill-venue-cities actually minted (2026-10-07..09).

Deno.test('strips wrapper words so the real town can match', () => {
  for (const [raw, want] of [
    ['Heraklion Municipal Unit', 'Heraklion'],
    ['Municipal Unit of Patras', 'Patras'],
    ['Overstrand Local Municipality', 'Overstrand'],
    ['Chișinău Municipality', 'Chișinău'],
    ['The Municipal District of Arklow', 'Arklow'],
    ['The Borough District of Wexford', 'Wexford'],
    ['Sligo Municipal Borough District', 'Sligo'],
    ['Town of Rab', 'Rab'],
    ['District of North Vancouver', 'North Vancouver'],
    ['Ciudad de México ', 'Ciudad de México'],
  ]) {
    const r = classifyGeocodedCityName(raw)
    assertEquals([r.name, r.allowCreate], [want, true], raw)
  }
})

Deno.test('a city subdivision may link but never create', () => {
  for (const raw of [
    'Botanica Sector',
    'Cukarica Urban Municipality',
    'Chaoyang District',
    'Zone 9',
    'Thanh Vinh Ward',
    'Tinet ward',
    'Central Business District',
    'Linwood-Central-Heathcote Community',
    'San Cistóbal, Sector Los Kioscos',
    'Pho Thong Subdistrict',
  ]) {
    const r = classifyGeocodedCityName(raw)
    assertEquals([r.allowCreate, r.reason], [false, 'subdivision'], raw)
  }
})

Deno.test('non-Latin names may link but never create', () => {
  for (const raw of ['Черкаська міська громада', 'חדרה', 'الحمامات', 'เทศบาลเมืองอุตรดิตถ์', 'Σμίξη']) {
    assertEquals(classifyGeocodedCityName(raw).reason, 'non_latin_name', raw)
  }
})

Deno.test('real municipalities and ordinary towns are untouched', () => {
  for (const raw of [
    'Abington Township',
    'Oxford Charter Township',
    'Madawaska Parish',
    'Saint-Martin-d\'Hères',
    'Zikhron Yaakov',
    'Edwardsville',
    'Žilina',
    'Waipū',
    "'s-Heer Arendskerke",
  ]) {
    const r = classifyGeocodedCityName(raw)
    assertEquals([r.name, r.allowCreate], [raw, true], raw)
  }
})

Deno.test('isLatinName', () => {
  assertEquals(isLatinName('Chișinău'), true)
  assertEquals(isLatinName('Hitiaʻa ʻo te Rā'), true)
  assertEquals(isLatinName('Σμίξη'), false)
  assertEquals(isLatinName('123'), false)
})
