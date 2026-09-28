import { test, expect } from '@playwright/test'
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey'

/**
 * source-gayout, verified through the surfaces a reader and a crawler actually get.
 *
 * WHAT THIS GUARDS THAT A UNIT TEST CANNOT. `parse.test.ts` proves the parser
 * reads gayout's JSON-LD correctly. It cannot prove the parsed row survived
 * validate, dedup and commit, nor that the result is readable by ANON — the
 * crawler path in `functions/_lib/detail.ts` fetches with the SERVICE ROLE, so a
 * page rendering for Googlebot is not evidence a signed-out visitor can see it.
 * Both halves are asserted separately here for that reason.
 *
 * EVERY ASSERTION IS PAIRED WITH A CONTROL. The dangerous failure for a spec
 * like this is passing while measuring nothing: an empty result set satisfies
 * "no truncated descriptions" and "no ungated criminalizing events" perfectly.
 * So each block first proves it is looking at real rows.
 *
 * It asserts the INVARIANT ("committed gayout events are complete and reachable"),
 * never a transient count — the backfill drains over hours and the cron keeps
 * refreshing, so pinning a row count would go red on correct data.
 */

const GAYOUT = `${SUPABASE_REST_URL}/rest/v1/events?data_source=eq.gayout&duplicate_of_id=is.null`
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

interface EventRow {
  slug: string | null
  title: string
  description: string | null
  start_date: string | null
  end_date: string | null
  city: string | null
  country: string | null
  venue_name: string | null
  event_type: string | null
  images: string[] | null
  safety_gated: boolean | null
  status: string | null
}

const COLS =
  'slug,title,description,start_date,end_date,city,country,venue_name,event_type,images,safety_gated,status'

async function fetchGayout(request: Parameters<typeof anonHeaders>[0], query = ''): Promise<EventRow[]> {
  const res = await request.get(`${GAYOUT}&select=${COLS}${query}`, {
    headers: await anonHeaders(request),
  })
  expect(res.ok(), `anon read of gayout events failed: ${res.status()}`).toBeTruthy()
  return (await res.json()) as EventRow[]
}

test.describe('gayout mega events', () => {
  test('anon can read committed gayout events, and every one is complete', async ({ request }) => {
    const rows = await fetchGayout(request, '&limit=200')

    // POSITIVE CONTROL. Without this the rest of the test passes on an empty
    // array — which is exactly what a broken import looks like.
    expect(
      rows.length,
      'anon sees no gayout events at all; every assertion below would pass vacuously',
    ).toBeGreaterThan(0)

    for (const r of rows) {
      expect(r.title?.trim(), `empty title on ${r.slug}`).toBeTruthy()
      // commit_event_staging_item RAISEs event_missing_start_date, so a row here
      // without one would mean the commit path changed under us.
      expect(r.start_date, `no start_date on ${r.slug}`).toBeTruthy()
      expect(r.status, `not active: ${r.slug}`).toBe('active')
      // Country is what scopes commit's city lookup; a city with no country is
      // the shape that mis-linked 122 events to same-name cities.
      expect(r.country, `no country on ${r.slug}`).toBeTruthy()
    }
  })

  test('descriptions are never the truncated variant gayout also publishes', async ({ request }) => {
    const rows = await fetchGayout(request, '&limit=200')
    const described = rows.filter(r => (r.description?.length ?? 0) > 0)

    // Control: prove there is prose to inspect before asserting things about it.
    expect(described.length, 'no gayout event carries a description').toBeGreaterThan(0)

    for (const r of described) {
      const d = r.description!.trimEnd()
      // gayout emits each event twice and the `Festival` copy is cut mid-word.
      // THE SIGNATURE IS WHERE THE TEXT ENDS, NOT WHAT IT CONTAINS: the measured
      // truncation stops at "tribe-specifi", which is a PREFIX of the correct
      // word "tribe-specific" that the full description legitimately contains.
      // A `not.toContain` here fails on correct data — it did, on first run.
      expect(
        d.endsWith('tribe-specifi'),
        `truncated description published on ${r.slug}`,
      ).toBeFalsy()
      expect(
        d.endsWith('…') || d.endsWith('...'),
        `description on ${r.slug} ends in an ellipsis, i.e. a listing snippet rather than the full text`,
      ).toBeFalsy()
    }

    // The real protection against picking the wrong block lives in
    // parse.test.ts, which has BOTH variants in a fixture and asserts the longer
    // one wins. This test can only see what was published, so it catches the
    // known instance and any snippet-shaped ending — state that rather than
    // implying it detects truncation in general.
  })

  test('event_type is always a value the CHECK constraint allows', async ({ request }) => {
    // A value outside this list violates events_event_type_check at commit and
    // takes the whole batch with it, so drift here is not cosmetic.
    const allowed = new Set([
      'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
      'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
      'fundraiser', 'protest', 'social', 'fair', 'cruise', 'comedy', 'exhibition',
      'other',
    ])
    const rows = await fetchGayout(request, '&limit=200')
    expect(rows.length).toBeGreaterThan(0)

    for (const r of rows) {
      expect(allowed.has(r.event_type ?? 'other'), `illegal event_type ${r.event_type} on ${r.slug}`).toBeTruthy()
    }

    // The source's own ?type= buckets should classify most of the corpus. If
    // this collapses to all-`other`, the classification step silently stopped
    // working and every event became untypeable — which no other assertion here
    // would notice.
    const typed = rows.filter(r => (r.event_type ?? 'other') !== 'other')
    expect(
      typed.length,
      'every gayout event is `other`; the ?type= classification has stopped resolving',
    ).toBeGreaterThan(0)
  })

  test('a safety-gated gayout event is never readable by anon', async ({ request }) => {
    // RLS on `events` is `NOT safety_gated OR auth.uid() IS NOT NULL`. gayout
    // lists prides in criminalizing countries (Lagos, Abidjan), so this source
    // genuinely can produce gated rows — publishing one to a signed-out visitor
    // is an outing exposure, not a cosmetic bug.
    const rows = await fetchGayout(request, '&limit=200')
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.safety_gated, `anon can read a safety-gated event: ${r.slug}`).not.toBe(true)
    }
  })

  test('a committed gayout event renders its own imported content to a crawler', async ({ request }) => {
    const rows = await fetchGayout(request, '&order=start_date.asc&limit=1')
    expect(rows.length, 'no gayout event to render').toBe(1)
    const ev = rows[0]
    expect(ev.slug, 'event has no slug, so it has no page').toBeTruthy()

    const res = await request.get(`https://queer.guide/events/${ev.slug}`, {
      headers: { 'User-Agent': CRAWLER_UA },
    })
    expect(res.status(), `crawler page for ${ev.slug}`).toBe(200)
    const html = await res.text()

    // The page must carry THIS event's own data, not merely exist. A SPA shell
    // returns 200 for anything, which is why the control below matters.
    expect(html).toContain(ev.title)
    expect(html, 'no JSON-LD on the crawler page').toContain('application/ld+json')

    // CONTROL: a slug that cannot exist must not also return 200, or the check
    // above proves only that the route answers.
    const bogus = await request.get('https://queer.guide/events/zzz-not-a-real-gayout-event-xyz', {
      headers: { 'User-Agent': CRAWLER_UA },
    })
    expect(bogus.status(), 'the events route 200s for any slug, so the assertion above is vacuous').not.toBe(200)
  })
})
