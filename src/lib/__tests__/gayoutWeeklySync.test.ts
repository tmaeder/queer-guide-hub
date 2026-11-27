import { describe, expect, it } from 'vitest'
import { parseGayOutSeed, parseGayOutSitemap, parseGayOutPage, isGayOutChallenge, gayOutPublicUrl } from '../../../supabase/functions/_shared/gayout-source'
import { gayOutBatchResult } from '../../../supabase/functions/_shared/gayout-pipeline'
import { fetchGayOutDocument } from '../../../supabase/functions/_shared/gayout-fetch'

const url = 'https://www.gayout.com/en/switzerland/zurich/bars/test-bar'
const seed = parseGayOutSeed(url, 'places')!
describe('GayOut weekly sync boundaries', () => {
  it('discovers all supported children and rejects external sitemap destinations', () => {
    expect(parseGayOutSitemap('<sitemapindex><sitemap><loc>https://www.gayout.com/maps/venues-2.xml</loc></sitemap><sitemap><loc>https://evil.test/a.xml</loc></sitemap></sitemapindex>', 'places').sitemaps).toEqual(['https://www.gayout.com/maps/venues-2.xml'])
    expect(parseGayOutSitemap(`<urlset><url><loc>${url}</loc></url><url><loc>${url}</loc></url></urlset>`, 'places').entries).toHaveLength(1)
    expect(gayOutPublicUrl('https://www.gayout.com.evil.test/foo')).toBeNull()
    expect(() => parseGayOutSitemap('<title>Just a moment...</title>', 'places')).toThrow()
  })
  it('extracts factual contacts without importing source descriptions or images', () => {
    const r = parseGayOutPage({ seed, country: 'CH', jsonLd: [{ '@type': 'BarOrPub', name: 'Test Bar', description: 'COPYRIGHTED COPY', image: 'image.jpg', address: { streetAddress: 'Main Street 3', addressLocality: 'Zurich' }, telephone: '+41441234567', url: 'https://test-bar.example' }] }).records[0]
    expect(r.contacts?.phone).toBe('+41441234567')
    expect(r.description).toBeUndefined()
    expect(r).not.toHaveProperty('image')
  })
  it('routes organisations separately and preserves source verification flags', () => {
    const org = parseGayOutSeed(url.replace('/bars/', '/organizations/'), 'places')!
    const r = parseGayOutPage({ seed: org, country: 'CH', sourceText: '# Test Bar\nUnverified', jsonLd: [{ '@type': 'Organization', name: 'Test Bar', telephone: '+41441234567' }] }).records[0]
    expect(org.targetTable).toBe('organizations')
    expect(r.entityType).toBe('organization')
    expect(r.metadata.source_unverified).toBe(true)
    const html = '<span>Unverified</span><h1>Test Bar</h1><script type="application/ld+json">' + JSON.stringify({ '@type': 'Organization', name: 'Test Bar', telephone: '+41441234567' }) + '</script>'
    expect(parseGayOutPage({ seed: org, country: 'CH', html }).records[0].metadata.source_unverified).toBe(true)
  })
  it('withholds unconfirmed times and gives recurring occurrences stable separate identities', () => {
    const eventSeed = parseGayOutSeed(url.replace('/bars/', '/events/'), 'events')!
    const event = { '@type': 'Event', url: eventSeed.url, name: 'Test Night', startDate: '2027-01-02T20:00:00+01:00', endDate: '2027-01-02T20:00:00+01:00' }
    expect(parseGayOutPage({ seed: eventSeed, country: 'CH', jsonLd: [{ ...event, startDate: '2027-01-02' }] }).records).toEqual([])
    expect(parseGayOutPage({ seed: eventSeed, country: 'CH', sourceText: '# Test Night\nDate TBA', jsonLd: [event] }).records).toEqual([])
    const r = parseGayOutPage({ seed: eventSeed, country: 'CH', jsonLd: [event, { ...event, startDate: '2027-01-03T20:00:00+01:00' }] }).records
    expect(r).toHaveLength(2)
    expect(r[0].sourceId).toBe('en/switzerland/zurich/events/test-bar#start=2027-01-02T19:00:00.000Z')
    expect(r[0].sourceId).not.toBe(r[1].sourceId)
    expect(r[0].dates?.end).toBeUndefined()
  })
  it('does not confuse ordinary Cloudflare scripts with a security challenge', () => {
    expect(isGayOutChallenge('<h1>Bar</h1><script src="/cdn-cgi/scripts/email-decode.min.js"></script>')).toBe(false)
    expect(isGayOutChallenge('<title>Just a moment...</title>')).toBe(true)
  })
  it('drains processed batches, honours explicit zero, and fails HTTP-200 errors', () => {
    expect(gayOutBatchResult(200, { success: false, error: 'quota' }, true, false).success).toBe(false)
    expect(gayOutBatchResult(200, { success: true, items: 0, items_total: 50 }, true, false).repeat).toBe(false)
    expect(gayOutBatchResult(200, { success: true, items: 0, items_processed: 4 }, true, false).repeat).toBe(true)
    expect(gayOutBatchResult(200, { success: true, has_more: true }, true, true).repeat).toBe(false)
  })
  it('reports exhausted provider credits and source rate limits', async () => {
    await expect(fetchGayOutDocument(url, { sitemap: false, firecrawlApiKey: 'fixture', fetcher: async input => new Response('', { status: String(input).includes('firecrawl') ? 402 : 403 }) })).rejects.toMatchObject({ code: 'E_GAYOUT_PROVIDER_QUOTA' })
    await expect(fetchGayOutDocument(url, { sitemap: false, fetcher: async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }) })).rejects.toMatchObject({ code: 'E_GAYOUT_RATE_LIMIT', retryAfterSeconds: 120 })
  })
  it('does not follow source redirects to another host', async () => {
    await expect(fetchGayOutDocument(url, { sitemap: false, fetcher: async () => new Response('', { status: 302, headers: { location: 'https://other.test/' } }) })).rejects.toMatchObject({ code: 'E_GAYOUT_REDIRECT_BLOCKED' })
  })
})
