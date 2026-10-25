// Use the website's public search boundary. Its Worker enforces anonymous
// content gating; the underlying database RPCs intentionally reject anon.
// Keep this function self-contained: the recovery builder serializes it.
export async function queryQueerGuidePublicSearch(fn, args, request = fetch) {
  const limit = Math.max(1, Math.min(fn === 'search_autocomplete' ? 20 : 50,
    Number.isFinite(args.p_limit) ? Math.floor(args.p_limit) : 10));
  let path;
  let body;
  let field;
  if (fn === 'search_hybrid') {
    path = 'search';
    field = 'hits';
    const filters = {};
    if (args.p_content_types?.length) filters.types = args.p_content_types;
    if (args.p_filters?.city) filters.city = args.p_filters.city;
    for (const [from, to] of [['p_lat', 'lat'], ['p_lng', 'lng'], ['p_radius_km', 'radius']])
      if (args[from] != null) filters[to] = args[from];
    body = { query: args.p_query, filters, hitsPerPage: limit, page: 0 };
  } else if (fn === 'search_autocomplete') {
    path = 'autocomplete';
    field = 'suggestions';
    body = { query: args.p_prefix, limit };
    if (args.p_content_types?.length) body.types = args.p_content_types;
  } else if (fn === 'get_recommendations') {
    path = 'recommendations';
    field = 'recommendations';
    body = { limit };
    if (args.p_content_types?.length) body.types = args.p_content_types;
    for (const [from, to] of [
      ['p_city', 'city'], ['p_lat', 'lat'], ['p_lng', 'lng'],
      ['p_radius_km', 'radius'], ['p_exclude_ids', 'exclude_ids'],
    ]) if (args[from] != null) body[to] = args[from];
  } else if (fn === 'related_entities') {
    path = 'similar';
    field = 'results';
    body = { entity_type: args.p_entity_type, entity_id: args.p_entity_id, limit };
    if (args.p_content_types?.length) body.content_types = args.p_content_types;
  } else {
    throw new Error('Unsupported public MCP query');
  }
  const response = await request(`https://search.queer.guide/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      'User-Agent': 'QueerGuideMCP/1.0 (+https://queer.guide/docs)',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
    // Workers supports manual/follow. Reject every non-2xx below, including 3xx.
    redirect: 'manual',
  });
  if (!response.ok) {
    if (response.body) await response.body.cancel();
    const retry = response.headers.get('Retry-After');
    const hint = response.status === 429 && /^\d{1,6}$/.test(retry ?? '')
      ? ` Retry after ${retry} seconds.` : ' Check the query or retry later.';
    throw new Error(`Public search request failed (HTTP ${response.status}).${hint}`);
  }
  if (response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    if (response.body) await response.body.cancel();
    throw new Error('Public search returned an unsupported response format');
  }
  if (!response.body) throw new Error('Public search returned an empty response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Public search response exceeded the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('Public search returned invalid JSON'); }
  if (!Array.isArray(data?.[field])) throw new Error('Public search returned an invalid result');
  // rpc(search_hybrid) returns an object; the other two RPC contracts are arrays.
  const results = data[field].slice(0, limit);
  if (fn === 'related_entities') return results.map((row) => ({
    ...row.metadata, objectID: row.content_id, type: row.content_type, _score: row.score,
  }));
  return fn === 'search_hybrid' ? { hits: results } : results;
}
