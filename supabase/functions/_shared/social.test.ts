// Guard for the login-wall handling in social.ts (the Deno twin of
// src/lib/social/registry.ts, which carries the same cases in vitest).
//
// Instagram redirects an anonymous request for a profile to
// /accounts/login/?next=<profile>. A 2026-03 patroc import stored 35 venue
// websites in that form, and the harvested value — the login page with its
// query stripped — then parsed as an Instagram "profile" with the handle
// `accounts`. Fixtures are the real prod values.
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  canonicalizeUrl,
  detectPlatform,
  extractSocialUrlsFromText,
  isLoginWallUrl,
  isShareOrWidgetUrl,
  normalizeHandle,
  normalizeSocialLinks,
  unwrapLoginWall,
} from './social.ts'

const FLUID =
  'https://www.instagram.com/accounts/login/?next=https%3A%2F%2Fwww.instagram.com%2Ffluidbcn%2F&is_from_rle'
const HARVESTED = 'https://www.instagram.com/accounts/login/'

Deno.test('login wall unwraps to the guarded profile', () => {
  assertEquals(isLoginWallUrl(FLUID), true)
  assertEquals(unwrapLoginWall(FLUID), 'https://www.instagram.com/fluidbcn/')
  assertEquals(unwrapLoginWall('https://www.instagram.com/accounts/login/?next=%2Ffluidbcn%2F'), 'https://www.instagram.com/fluidbcn/')
})

Deno.test('login wall is never a profile with the handle "accounts"', () => {
  assertEquals(detectPlatform(HARVESTED), null)
  assertEquals(isShareOrWidgetUrl(HARVESTED), true)
  assertEquals(normalizeHandle('instagram', HARVESTED), null)
  assertEquals(normalizeSocialLinks({ instagram: HARVESTED }), {})
})

Deno.test('detection and canonicalization go through the wall', () => {
  assertEquals(detectPlatform(FLUID), 'instagram')
  assertEquals(normalizeHandle('instagram', FLUID), 'fluidbcn')
  assertEquals(canonicalizeUrl('instagram', FLUID), 'https://instagram.com/fluidbcn')
  assertEquals(normalizeSocialLinks({ instagram: FLUID }), { instagram: 'https://instagram.com/fluidbcn' })
  assertEquals(extractSocialUrlsFromText(`<a href="${FLUID}">IG</a>`), { instagram: 'https://instagram.com/fluidbcn' })
})

Deno.test('next leaving the platform or looping back is rejected', () => {
  assertEquals(unwrapLoginWall('https://www.instagram.com/accounts/login/?next=https%3A%2F%2Fevil.example%2Fx'), null)
  assertEquals(
    unwrapLoginWall('https://www.instagram.com/accounts/login/?next=https%3A%2F%2Fwww.instagram.com%2Faccounts%2Flogin%2F'),
    null,
  )
})

Deno.test('/login on an ordinary website is left alone', () => {
  assertEquals(isLoginWallUrl('https://example.com/login'), false)
  assertEquals(detectPlatform('https://example.com/login'), 'website')
})
