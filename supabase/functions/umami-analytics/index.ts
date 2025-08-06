import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UmamiEvent {
  website: string;
  hostname?: string;
  language?: string;
  referrer?: string;
  screen?: string;
  title?: string;
  url: string;
  name?: string;
  data?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const umamiUrl = Deno.env.get('UMAMI_URL') || 'https://cloud.umami.is';
    const websiteId = Deno.env.get('UMAMI_WEBSITE_ID');
    
    if (!websiteId) {
      throw new Error('UMAMI_WEBSITE_ID environment variable is required');
    }

    const body = await req.json();
    const { 
      hostname, 
      language, 
      referrer, 
      screen, 
      title, 
      url, 
      name, 
      data 
    } = body;

    // Prepare the event data for Umami
    const eventData: UmamiEvent = {
      website: websiteId,
      hostname: hostname || req.headers.get('host') || 'unknown',
      language: language || 'en',
      referrer: referrer || req.headers.get('referer') || '',
      screen: screen || '1920x1080',
      title: title || 'Page View',
      url: url || '/',
    };

    // Add event name and data if this is a custom event
    if (name) {
      eventData.name = name;
    }
    
    if (data) {
      eventData.data = data;
    }

    console.log('Sending event to Umami:', eventData);

    // Send the event to Umami
    const response = await fetch(`${umamiUrl}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': req.headers.get('user-agent') || 'Queer Guide Analytics',
      },
      body: JSON.stringify({
        type: 'event',
        payload: eventData,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Umami API Error:', response.status, errorText);
      throw new Error(`Umami API error: ${response.status}`);
    }

    const result = await response.text();
    console.log('Umami response:', result);

    return new Response(
      JSON.stringify({ success: true, message: 'Event tracked successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in umami-analytics function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});