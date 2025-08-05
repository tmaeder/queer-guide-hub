import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { token, action = 'login' } = await req.json();
    
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
    if (!turnstileSecret) {
      console.error('TURNSTILE_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Turnstile not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get client IP and user agent
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Verify the token with Cloudflare
    const formData = new FormData();
    formData.append('secret', turnstileSecret);
    formData.append('response', token);
    formData.append('remoteip', clientIP);

    const verifyResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
      }
    );

    const verifyResult = await verifyResponse.json();
    
    // Log the verification attempt
    const { data: authData } = await supabase.auth.getUser();
    
    await supabase
      .from('captcha_verifications')
      .insert({
        user_id: authData.user?.id || null,
        success: verifyResult.success,
        ip_address: clientIP,
        user_agent: userAgent,
      });

    console.log('Turnstile verification result:', {
      success: verifyResult.success,
      action: action,
      clientIP: clientIP,
      errorCodes: verifyResult['error-codes']
    });

    if (verifyResult.success) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Captcha verified successfully',
          action: verifyResult.action 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Captcha verification failed',
          errorCodes: verifyResult['error-codes']
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})