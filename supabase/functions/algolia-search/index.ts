Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }
  // DEPRECATED: Use /functions/v1/search instead
  // Forward to the new search endpoint
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const body = await req.json().catch(() => ({}));
  const response = await fetch(`${supabaseUrl}/functions/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': req.headers.get('Authorization') || '',
      'apikey': req.headers.get('apikey') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await response.text();
  return new Response(data, {
    status: response.status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'X-Deprecated': 'Use /functions/v1/search instead' },
  });
});
