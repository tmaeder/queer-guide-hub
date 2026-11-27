import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { MissingCredentialsError, InvalidCredentialsError } from '../_shared/source-adapter.ts'
import { resolveAwinFeedUrl } from './feed.ts'

const noFetch = (() => { throw Error('Unexpected network request') }) as typeof fetch
const env = (values: Record<string, string>) => (key: string) => values[key]
Deno.test('Awin explicit feed works without a Publisher API token', async () => {
  const url = 'https://productdata.awin.com/datafeed/download/apikey/private-key'
  assertEquals(await resolveAwinFeedUrl(undefined, env({ AWIN_FEED_URL: url }), noFetch), url)
})
Deno.test('Awin Publisher API token is never sent to the datafeed API', async () => {
  await assertRejects(() => resolveAwinFeedUrl(undefined, env({ AWIN_API_TOKEN: 'publisher-token', AWIN_ADVERTISER_ID: '7' }), noFetch), MissingCredentialsError, 'AWIN_DATAFEED_API_KEY')
})
Deno.test('Awin reports the advertiser selector when missing', async () => {
  await assertRejects(() => resolveAwinFeedUrl(undefined, env({ AWIN_DATAFEED_API_KEY: 'feed-key' }), noFetch), MissingCredentialsError, 'AWIN_ADVERTISER_ID')
})
Deno.test('Awin rejected datafeed keys produce an actionable configuration result', async () => {
  for (const status of [401, 403]) await assertRejects(() => resolveAwinFeedUrl(undefined,
    env({ AWIN_DATAFEED_API_KEY: 'feed-key', AWIN_ADVERTISER_ID: '7' }), (() => Promise.resolve(new Response('', { status }))) as typeof fetch), InvalidCredentialsError, 'AWIN_DATAFEED_API_KEY')
})
Deno.test('Awin selects exactly one English advertiser feed', async () => {
  const csv = 'Advertiser ID,Language,URL\n8,English,https://productdata.awin.com/other\n7,English,https://productdata.awin.com/chosen\n7,German,https://productdata.awin.com/de'
  assertEquals(await resolveAwinFeedUrl(undefined, env({ AWIN_DATAFEED_API_KEY: 'feed-key', AWIN_ADVERTISER_ID: '7' }), (() => Promise.resolve(new Response(csv))) as typeof fetch), 'https://productdata.awin.com/chosen')
})
Deno.test('Awin ambiguous feeds require an explicit selection', async () => {
  const csv = 'Advertiser ID,Language,URL\n7,English,https://productdata.awin.com/a\n7,en,https://productdata.awin.com/b'
  await assertRejects(() => resolveAwinFeedUrl(undefined, env({ AWIN_DATAFEED_API_KEY: 'feed-key', AWIN_ADVERTISER_ID: '7' }), (() => Promise.resolve(new Response(csv))) as typeof fetch), MissingCredentialsError, 'AWIN_FEED_URL')
})
Deno.test('Awin rejects unsupported download targets without fetching them', async () => {
  for (const url of ['http://productdata.awin.com/feed', 'https://private.example/feed', 'https://user:pass@productdata.awin.com/feed'])
    await assertRejects(() => resolveAwinFeedUrl(url, env({}), noFetch), MissingCredentialsError, 'AWIN_FEED_URL')
})
Deno.test('Awin inventory outages remain failures rather than credential blocks', async () => {
  await assertRejects(() => resolveAwinFeedUrl(undefined, env({ AWIN_DATAFEED_API_KEY: 'feed-key', AWIN_ADVERTISER_ID: '7' }), (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch), Error, 'HTTP 503')
})
