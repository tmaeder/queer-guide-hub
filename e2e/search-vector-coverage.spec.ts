import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The vector arm of search is actually serving organizations.
 *
 * `search_hybrid` fuses a keyword arm and a vector arm; the vector arm scans
 * `search_embeddings`, which is filled by two triggers and reconciled by the
 * ten-minute backstop `search_embeddings_reconcile`. When that reconciler stops
 * completing, a document indexed ahead of its vector — or one whose trigger
 * write was swallowed by `exception when others then null` — stays
 * vector-invisible with nothing to re-fire it.
 *
 * Organizations are the canonical victims and the reason the reconciler
 * exists: all 6,284 organization documents were inserted before the
 * organizations arm was added to `embedding_candidates` (#3576), so their
 * insert-time pull had already fired against an empty `content_embeddings`.
 *
 * THIS RUNS AGAINST THE REAL WORKER, UNMOCKED, ON PURPOSE.
 * `e2e/search.spec.ts` and `e2e/search-ux.spec.ts` both mock
 * `search.queer.guide` at the network layer so they can run anywhere — which
 * is right for the UI invariants they assert and means neither of them can
 * observe index state at all. Nothing else in the suite would notice the
 * vector index decaying.
 *
 * WHY THE CONTROL IS THE LOAD-BEARING HALF. The obvious assertion — "a
 * semantic query returns results" — is VACUOUS here, and that was measured
 * rather than reasoned about: `"zxqvwk plorbnat frumious"` returns 40 total
 * hits, because a nearest-neighbour arm returns neighbours for any vector,
 * including one built from gibberish. So presence proves nothing and only
 * COMPOSITION does. Measured on prod 2026-09-20, three consecutive runs each:
 *
 *   "nonprofit advocacy group supporting trans rights"  ->  12 of 20 organization
 *   "zxqvwk plorbnat frumious"                          ->   0 of 20 organization
 *
 * The control shares the `search_hybrid` path, the fusion and the limit with
 * the real query and differs only in carrying meaning, so a run where both
 * pass is a run where retrieval is genuinely discriminating. Assert the
 * control FIRST: if it ever starts returning organizations, the main
 * assertion has stopped meaning anything and must not be read as a pass.
 *
 * Thresholds sit well inside the measured gap (>= 4 against 12, <= 1 against
 * 0) so ordinary corpus drift does not flake this, while a type dropping out
 * of the vector index does fail it.
 */

const SEARCH_URL = process.env.E2E_SEARCH_URL ?? 'https://search.queer.guide/search';

/** The query words themselves appear in none of the top organization titles —
 *  this is retrieved semantically, not lexically. */
const SEMANTIC_QUERY = 'nonprofit advocacy group supporting trans rights';

/** Pronounceable but meaningless. Not a typo of anything in the corpus. */
const CONTROL_QUERY = 'zxqvwk plorbnat frumious';

const MIN_ORGS = 4; // measured 12
const MAX_CONTROL_ORGS = 1; // measured 0

type Hit = { type?: string; title?: string };

async function search(request: APIRequestContext, query: string): Promise<Hit[]> {
  const res = await request.post(SEARCH_URL, {
    data: { query },
    headers: { 'content-type': 'application/json' },
  });
  expect(res.status(), `${SEARCH_URL} should answer 200 for ${JSON.stringify(query)}`).toBe(200);
  const body = (await res.json()) as { hits?: Hit[] };
  // A 200 carrying no `hits` array at all is a worker/RPC fault, not an empty
  // result set — fail loudly rather than counting zero organizations in it.
  expect(Array.isArray(body.hits), 'response should carry a hits array').toBe(true);
  return body.hits ?? [];
}

const orgCount = (hits: Hit[]) => hits.filter((h) => h.type === 'organization').length;

test.describe('search vector coverage (live worker, prod)', () => {
  test('a meaningless query retrieves no organizations — the control', async ({ request }) => {
    const hits = await search(request, CONTROL_QUERY);
    // Not an assertion about emptiness: this query DOES return a full page of
    // nearest neighbours. It must simply not return the type the next test
    // looks for, or that test passes on noise.
    expect(hits.length, 'control should still return a page of neighbours').toBeGreaterThan(0);
    expect(
      orgCount(hits),
      `control query returned organizations — the coverage assertion below is no longer discriminating`,
    ).toBeLessThanOrEqual(MAX_CONTROL_ORGS);
  });

  test('a semantic organization query retrieves organizations', async ({ request }) => {
    const hits = await search(request, SEMANTIC_QUERY);
    expect(
      orgCount(hits),
      `organizations missing from vector results — search_embeddings coverage may have decayed ` +
        `(check search_embeddings_reconcile is completing: it timed out at 120s on 33% of runs ` +
        `before 99991789893178)`,
    ).toBeGreaterThanOrEqual(MIN_ORGS);
  });
});
