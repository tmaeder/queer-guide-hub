import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts';

const supabase = getServiceClient();

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    const { data, error } = await supabase.rpc('track_umami_event', { payload });

    if (error) {
      console.error('track_umami_event RPC error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (data && data.success === false) {
      console.warn('track_umami_event soft-failed:', data.error);
    }

    return new Response(
      JSON.stringify(data ?? { success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in umami-analytics function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to process analytics event' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
