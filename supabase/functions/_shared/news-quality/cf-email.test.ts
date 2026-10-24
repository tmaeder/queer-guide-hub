import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decodeCfEmail } from './cf-email.ts'
import { extractArticle } from './extract.ts'

// Real Washington Blade markup (2026-10-24).
const HTML = `<!doctype html><html><head><title>Center careers</title></head><body><article>
  <p>The center runs a careers programme for LGBTQ job seekers across the region, with workshops every month and one-to-one coaching sessions for anyone who signs up in advance.</p>
  <p>For details email <a href="/cdn-cgi/l/email-protection#2e4d4b405a4b5c"><span class="__cf_email__" data-cfemail="7310161d0716011012011616010033071b16171010161d0716015d1c0114">[email&#160;protected]</span></a> or visit the center's website for the full schedule of sessions.</p>
</article></body></html>`

Deno.test('decodeCfEmail decodes a real hash and rejects junk', () => {
  assertEquals(decodeCfEmail('7310161d0716011012011616010033071b16171010161d0716015d1c0114'), 'centercareers@thedccenter.org')
  assertEquals(decodeCfEmail('zz'), null)
  assertEquals(decodeCfEmail('2e4d'), null)
})

Deno.test('extractArticle restores the obfuscated address', () => {
  const r = extractArticle(HTML, 'https://www.washingtonblade.com/x/')
  assertStringIncludes(r.content, 'email centercareers@thedccenter.org or visit')
  assertEquals(r.content.includes('protected'), false)
})
