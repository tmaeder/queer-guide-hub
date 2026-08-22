import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  imageSize,
  isAcceptableLogoType,
  isResizableCdnUrl,
  pickSiteIcon,
  sameSiteOrCdn,
  upsizeCdnUrl,
} from './site-icon.ts'

const BASE = 'https://cherrykitten.com/'

Deno.test('an explicit JSON-LD Organization logo outranks every icon', () => {
  const html = `<head>
    <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"Cherry Kitten",
       "logo":{"@type":"ImageObject","url":"https://cdn.shopify.com/logo.png"}}
    </script>
  </head>`
  const hit = pickSiteIcon(html, BASE)
  assertEquals(hit?.kind, 'jsonld')
  assertEquals(hit?.url, 'https://cdn.shopify.com/logo.png')
})

Deno.test('a logo nested under @graph is still found', () => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"WebSite","name":"x"},{"@type":"Organization","logo":"/brand/mark.png"}]}
  </script>`
  assertEquals(pickSiteIcon(html, BASE)?.url, 'https://cherrykitten.com/brand/mark.png')
})

Deno.test('malformed JSON-LD does not lose the apple-touch-icon behind it', () => {
  const html = `
    <script type="application/ld+json">{ this is not json }</script>
    <link rel="apple-touch-icon" href="/touch.png">`
  const hit = pickSiteIcon(html, BASE)
  assertEquals(hit?.kind, 'apple-touch-icon')
  assertEquals(hit?.url, 'https://cherrykitten.com/touch.png')
})

Deno.test('apple-touch-icon beats a same-size plain icon', () => {
  const html = `
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">`
  assertEquals(pickSiteIcon(html, BASE)?.url, 'https://cherrykitten.com/touch.png')
})

Deno.test('a 32x32 favicon is rejected — the monogram is a better logo plate', () => {
  const html = `<link rel="shortcut icon" type="image/png" sizes="32x32" href="/favicon-32.png">`
  assertEquals(pickSiteIcon(html, BASE), null)
})

Deno.test('an SVG icon is accepted whatever its declared size, being scalable', () => {
  const html = `<link rel="icon" type="image/svg+xml" href="/logo.svg" sizes="any">`
  assertEquals(pickSiteIcon(html, BASE)?.url, 'https://cherrykitten.com/logo.svg')
})

Deno.test('og:image is never a logo source — it is a hero photo on a shop', () => {
  const html = `<meta property="og:image" content="https://cdn.shopify.com/hero-model.jpg">`
  assertEquals(pickSiteIcon(html, BASE), null)
})

Deno.test('single-quoted and unquoted attributes parse', () => {
  assertEquals(
    pickSiteIcon(`<link rel='apple-touch-icon' href='/a.png'>`, BASE)?.url,
    'https://cherrykitten.com/a.png',
  )
  assertEquals(
    pickSiteIcon(`<link rel=apple-touch-icon href=/b.png>`, BASE)?.url,
    'https://cherrykitten.com/b.png',
  )
})

Deno.test('a data: or javascript: href is discarded, not absolutized', () => {
  assertEquals(pickSiteIcon(`<link rel="apple-touch-icon" href="data:image/png;base64,AA">`, BASE), null)
})

Deno.test('ICO is not an acceptable logo type', () => {
  assertEquals(isAcceptableLogoType('image/png'), true)
  assertEquals(isAcceptableLogoType('image/svg+xml; charset=utf-8'), true)
  assertEquals(isAcceptableLogoType('image/x-icon'), false)
  assertEquals(isAcceptableLogoType('text/html'), false)
  assertEquals(isAcceptableLogoType(null), false)
})

// ── The Shopify arm ─────────────────────────────────────────────────────────

Deno.test('a Shopify CDN url is re-requested large and uncropped', () => {
  assertEquals(
    upsizeCdnUrl('https://x.com/cdn/shop/files/Logo1.png?crop=center&height=32&v=17&width=32'),
    'https://x.com/cdn/shop/files/Logo1.png?v=17&width=512',
  )
})

Deno.test('a non-resizable url is left exactly as it is', () => {
  const u = 'https://barcodeberlin.com/img/logo.png?1709196087'
  assertEquals(upsizeCdnUrl(u), u)
  assertEquals(isResizableCdnUrl(u), false)
})

Deno.test('a 32px-DECLARED Shopify icon is kept — the 32 is a resize request', () => {
  // cherrykitten.com: the asset behind this is a 256px PNG named "Logo1".
  // Rejecting on the declared size threw away the best mark on the site.
  const html = `<link rel="icon" type="image/png" sizes="32x32"
    href="//cherrykitten.com/cdn/shop/files/Logo1.png?crop=center&height=32&v=1&width=32">`
  const hit = pickSiteIcon(html, BASE)
  assertEquals(hit?.kind, 'icon')
  assertEquals(hit?.url.includes('width=512'), true)
  assertEquals(hit?.url.includes('crop'), false)
})

// ── The header wordmark ─────────────────────────────────────────────────────

Deno.test('the header logo img outranks the apple-touch-icon', () => {
  const html = `
    <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
    <header><img class="header__heading-logo" src="/wordmark.png" alt="Cherry Kitten"></header>`
  const hit = pickSiteIcon(html, BASE)
  assertEquals(hit?.kind, 'header-img')
  assertEquals(hit?.url, 'https://cherrykitten.com/wordmark.png')
})

Deno.test('logout icons, payment strips and partner carousels are not logos', () => {
  const html = `
    <img class="icon-logout" src="/logout.png" alt="Log out">
    <img class="payment-logos" src="/visa.png" alt="Payment logos">
    <img class="logo-slider__item" src="/partner.png" alt="Partner logo">`
  assertEquals(pickSiteIcon(html, BASE), null)
})

// ── Whose logo is it ────────────────────────────────────────────────────────

Deno.test('a sibling brand on another domain is refused, redirect or not', () => {
  // cellblock13.net 301s to timoteo.net and declares Timoteo's logo. Judged
  // against where we LANDED it passes; judged against what we ASKED for it does
  // not, and publishing Timoteo's mark as CellBlock 13 is the whole failure.
  const html = `<script type="application/ld+json">
    {"@type":"Organization","logo":"https://timoteo.net/cdn/shop/files/mark.png"}</script>`
  // On timoteo.net's own page it IS the right logo.
  assertEquals(pickSiteIcon(html, 'https://timoteo.net/')?.kind, 'jsonld')
  // Reached by following cellblock13.net's redirect, it is not.
  assertEquals(pickSiteIcon(html, 'https://timoteo.net/', 'https://cellblock13.net/'), null)
})

Deno.test('a subdomain and a known asset CDN both count as the same shop', () => {
  assertEquals(sameSiteOrCdn('https://store.nastypig.com/l.png', 'https://nastypig.com/'), true)
  assertEquals(sameSiteOrCdn('https://cdn.shopify.com/x/l.png', 'https://nastypig.com/'), true)
  assertEquals(sameSiteOrCdn('https://img1.wsimg.com/x/l.jpg', 'https://oxballs.com/'), true)
  assertEquals(sameSiteOrCdn('https://timoteo.net/x/l.png', 'https://cellblock13.net/'), false)
})

Deno.test('a white/inverted variant is demoted behind the plain mark', () => {
  // The plate is paper in BOTH themes, so a white wordmark on it is invisible.
  const html = `
    <script type="application/ld+json">
      {"@type":"Organization","logo":"/cdn/shop/files/REG-brand-white.png"}</script>
    <link rel="apple-touch-icon" sizes="180x180" href="/cdn/shop/files/favicon.png">`
  assertEquals(pickSiteIcon(html, BASE)?.kind, 'apple-touch-icon')
})

// ── Pixel evidence ──────────────────────────────────────────────────────────

Deno.test('imageSize reads PNG, GIF and JPEG headers', () => {
  const png = new Uint8Array(32)
  png.set([0x89, 0x50, 0x4e, 0x47], 0)
  new DataView(png.buffer).setUint32(16, 256)
  new DataView(png.buffer).setUint32(20, 128)
  assertEquals(imageSize(png), { width: 256, height: 128 })

  const gif = new Uint8Array(16)
  gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0)
  new DataView(gif.buffer).setUint16(6, 48, true)
  new DataView(gif.buffer).setUint16(8, 24, true)
  assertEquals(imageSize(gif), { width: 48, height: 24 })

  // SOI, then an APP0 segment to skip, then SOF0 carrying height then width.
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x01, 0x90, 0x03, 0x00, 0x00, 0x00,
  ])
  assertEquals(imageSize(jpeg), { width: 400, height: 100 })
})

Deno.test('imageSize returns null for something that is not an image', () => {
  assertEquals(imageSize(new TextEncoder().encode('<!doctype html><html>')), null)
})
