import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders } from '../_shared/supabase-client.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
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
          headers: { ...cors, 'Content-Type': 'application/json' } 
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
          headers: { ...cors, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get client IP and user agent
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Rate limiting for verification attempts
    const { data: rateLimitResult, error: rateLimitError } = await supabase
      .rpc('check_rate_limit', {
        identifier: clientIP,
        max_attempts: 5,
        time_window_minutes: 15
      });

    if (rateLimitError || !rateLimitResult) {
      // Log security event for rate limit exceeded
      await supabase
        .rpc('log_enhanced_security_event', {
          event_type: 'TURNSTILE_RATE_LIMIT_EXCEEDED',
          user_id: null,
          details: {
            ip_address: clientIP,
            user_agent: userAgent,
            action: action,
            timestamp: new Date().toISOString()
          },
          severity: 'high'
        });

      return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded' }),
        { 
          status: 429, 
          headers: { ...cors, 'Content-Type': 'application/json' } 
        }
      );
    }

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
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    
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
      // Log successful verification
      await supabase
        .rpc('log_enhanced_security_event', {
          event_type: 'TURNSTILE_VERIFICATION_SUCCESS',
          user_id: authData.user?.id || null,
          details: {
            ip_address: clientIP,
            user_agent: userAgent,
            action: action,
            timestamp: new Date().toISOString()
          },
          severity: 'low'
        });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Captcha verified successfully',
          action: verifyResult.action 
        }),
        { 
          status: 200, 
          headers: { ...cors, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      // Log failed verification with security monitoring
      await supabase
        .rpc('log_enhanced_security_event', {
          event_type: 'TURNSTILE_VERIFICATION_FAILED',
          user_id: authData.user?.id || null,
          details: {
            ip_address: clientIP,
            user_agent: userAgent,
            action: action,
            error_codes: verifyResult['error-codes'],
            timestamp: new Date().toISOString()
          },
          severity: 'medium'
        });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Captcha verification failed',
          errorCodes: verifyResult['error-codes']
        }),
        { 
          status: 400, 
          headers: { ...cors, 'Content-Type': 'application/json' } 
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
        headers: { ...cors, 'Content-Type': 'application/json' } 
      }
    );
  }
})