import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryQueerGuidePublicSearch } from './public-queries.mjs';

function respond(data, inspect = () => {}) {
  return async (url, init) => {
    inspect(url, init, JSON.parse(init.body));
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, {
      'Content-Type': 'application/json', Accept: 'application/json',
      'User-Agent': 'QueerGuideMCP/1.0 (+https://queer.guide/docs)',
    });
    assert.equal(init.redirect, 'manual');
    assert(init.signal instanceof AbortSignal);
    return Response.json(data);
  };
}

test('search maps filters and geo while dropping privilege, identity and embedding fields', async () => {
  const hits = [{ objectID: 'public-city', title: 'Zurich' }];
  const result = await queryQueerGuidePublicSearch('search_hybrid', {
    p_query: 'Zurich', p_content_types: ['city'], p_limit: 3,
    p_filters: { city: 'Zurich', include_gated: true, user_id: 'private-user' },
    p_lat: 47.37, p_lng: 8.54, p_radius_km: 10,
    p_query_vec: '[1,2]', p_include_gated: true, user_id: 'private-user',
    session_id: 'private-session', authorization: 'private-token',
  }, respond({ hits }, (url, init, body) => {
    assert.equal(url, 'https://search.queer.guide/search');
    assert.deepEqual(body, {
      query: 'Zurich', hitsPerPage: 3, page: 0,
      filters: { types: ['city'], city: 'Zurich', lat: 47.37, lng: 8.54, radius: 10 },
    });
    assert(!init.body.includes('private-'));
  }));
  assert.deepEqual(result, { hits });
});

test('autocomplete maps prefix and returns the original RPC array shape', async () => {
  const suggestions = [{ objectID: 'city', title: 'Zurich' }];
  const result = await queryQueerGuidePublicSearch('search_autocomplete', {
    p_prefix: 'Zur', p_content_types: ['city'], p_limit: 100,
  }, respond({ suggestions }, (url, init, body) => {
    assert.equal(url, 'https://search.queer.guide/autocomplete');
    assert.deepEqual(body, { query: 'Zur', types: ['city'], limit: 20 });
  }));
  assert.deepEqual(result, suggestions);
});

test('recommendations preserve public filters, exclusions and array shape without personalization', async () => {
  const recommendations = [{ objectID: 'venue' }];
  const result = await queryQueerGuidePublicSearch('get_recommendations', {
    p_content_types: ['venue'], p_city: 'Zurich', p_lat: 0, p_lng: 0,
    p_radius_km: 12, p_exclude_ids: ['omitted'], p_limit: 12,
    p_bias_vec: '[1,2]', p_include_gated: true, user_id: 'private-user',
  }, respond({ recommendations }, (url, init, body) => {
    assert.equal(url, 'https://search.queer.guide/recommendations');
    assert.deepEqual(body, {
      types: ['venue'], city: 'Zurich', lat: 0, lng: 0, radius: 12,
      exclude_ids: ['omitted'], limit: 12,
    });
  }));
  assert.deepEqual(result, recommendations);
});

test('null optional fields are omitted and an empty result stays empty', async () => {
  assert.deepEqual(await queryQueerGuidePublicSearch('get_recommendations', {
    p_content_types: null, p_city: null, p_lat: null, p_lng: null, p_radius_km: null,
  }, respond({ recommendations: [] }, (url, init, body) => {
    assert.deepEqual(body, { limit: 10 });
  })), []);
});

test('related items use the gated public service and normalize legacy cards for MCP', async () => {
  const result = await queryQueerGuidePublicSearch('related_entities', {
    p_entity_type: 'city', p_entity_id: 'seed-city', p_content_types: ['city'], p_limit: 4,
    p_include_gated: true, p_user_id: 'private-user',
  }, respond({ results: [{
    content_id: 'related-city', content_type: 'city', score: 0.9,
    metadata: { title: 'Zurich', slug: 'zurich' },
  }] }, (url, init, body) => {
    assert.equal(url, 'https://search.queer.guide/similar');
    assert.deepEqual(body, { entity_type: 'city', entity_id: 'seed-city', content_types: ['city'], limit: 4 });
  }));
  assert.deepEqual(result, [{ objectID: 'related-city', type: 'city', title: 'Zurich', slug: 'zurich', _score: 0.9 }]);
});

test('limits are bounded and the returned result cannot exceed the requested limit', async () => {
  for (const [input, expected] of [[100, 50], [0, 1], [2.8, 2]]) {
    const result = await queryQueerGuidePublicSearch('search_hybrid', {
      p_query: 'city', p_limit: input,
    }, respond({ hits: Array.from({ length: 60 }, (_, objectID) => ({ objectID })) },
      (url, init, body) => assert.equal(body.hitsPerPage, expected)));
    assert.equal(result.hits.length, expected);
  }
});

test('unsupported RPCs cannot be sent to arbitrary endpoints', async () => {
  await assert.rejects(queryQueerGuidePublicSearch('admin_rpc', {}, () => {
    assert.fail('must not fetch');
  }), /Unsupported public MCP query/);
});

test('upstream errors provide a retry hint without reflecting private or HTML bodies', async () => {
  await assert.rejects(queryQueerGuidePublicSearch('search_hybrid', {}, async () =>
    new Response('<html>private-upstream-debug</html>', {
      status: 429, headers: { 'Retry-After': '30' },
    })), (error) => {
    assert.match(error.message, /HTTP 429/);
    assert.match(error.message, /Retry after 30 seconds/);
    assert(!error.message.includes('private-upstream-debug'));
    return true;
  });
});

test('rejects redirects without following them to another service', async () => {
  await assert.rejects(queryQueerGuidePublicSearch('search_hybrid', {}, async (url, init) => {
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/' } });
  }), /HTTP 302/);
});

test('rejects HTML, invalid JSON and wrong result shapes with non-reflective errors', async () => {
  for (const response of [
    new Response('<html>private-debug</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('private-debug', { headers: { 'Content-Type': 'application/json' } }),
    Response.json({ hits: 'private-debug' }),
    Response.json(null),
  ]) {
    await assert.rejects(queryQueerGuidePublicSearch('search_hybrid', {}, async () => response),
      (error) => !error.message.includes('private-debug'));
  }
});

test('caps streamed response size before parsing', async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(queryQueerGuidePublicSearch('search_hybrid', {}, async () =>
    new Response(body, { headers: { 'Content-Type': 'application/json' } })), /size limit/);
  assert(canceled);
});
