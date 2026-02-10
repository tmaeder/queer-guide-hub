Deno.serve(() => new Response(
  JSON.stringify({ error: 'DEPRECATED: Algolia has been replaced with PostgreSQL full-text search. No sync needed.' }),
  { status: 410, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
));
