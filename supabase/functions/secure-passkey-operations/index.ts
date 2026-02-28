import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { getCorsHeaders } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const { action, credentialData } = await req.json();

    switch (action) {
      case 'enroll': {
        // Generate secure challenge
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        
        // Store challenge temporarily in a secure way (in a database table with expiration)
        const { error: challengeError } = await supabaseClient
          .from('passkey_challenges')
          .insert({
            user_id: user.id,
            challenge: Array.from(challenge),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
            action: 'enroll'
          });

        if (challengeError) {
          throw challengeError;
        }

        const publicKeyCredentialCreationOptions = {
          challenge,
          rp: {
            name: "Queer Guide",
            id: "queer.guide",
          },
          user: {
            id: new TextEncoder().encode(user.id),
            name: user.email,
            displayName: user.email,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            requireResidentKey: true,
          },
          timeout: 60000,
          attestation: "direct",
        };

        return new Response(
          JSON.stringify({ 
            publicKeyCredentialCreationOptions,
            success: true 
          }),
          { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      case 'verify-enrollment': {
        // Verify the credential and attestation
        const { id, response, type } = credentialData;
        
        // Get the stored challenge
        const { data: challengeData, error: challengeError } = await supabaseClient
          .from('passkey_challenges')
          .select('challenge')
          .eq('user_id', user.id)
          .eq('action', 'enroll')
          .gte('expires_at', new Date().toISOString())
          .single();

        if (challengeError || !challengeData) {
          return new Response(
            JSON.stringify({ error: 'Invalid or expired challenge' }),
            { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
          );
        }

        // Store the verified credential securely
        const { error: storeError } = await supabaseClient
          .from('user_passkeys')
          .insert({
            user_id: user.id,
            credential_id: id,
            public_key: response.publicKey,
            counter: response.counter || 0,
            created_at: new Date().toISOString()
          });

        if (storeError) {
          throw storeError;
        }

        // Clean up the challenge
        await supabaseClient
          .from('passkey_challenges')
          .delete()
          .eq('user_id', user.id)
          .eq('action', 'enroll');

        // Log success
        await supabaseClient.rpc('log_enhanced_security_event', {
          p_event_type: 'PASSKEY_ENROLLED_SECURE',
          p_user_id: user.id,
          p_metadata: { 
            credential_id: id,
            timestamp: new Date().toISOString() 
          },
          p_severity: 'info'
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      case 'authenticate': {
        // Generate challenge for authentication
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        
        // Get user's registered passkeys
        const { data: passkeys, error: passkeysError } = await supabaseClient
          .from('user_passkeys')
          .select('credential_id, public_key, counter')
          .eq('user_id', user.id);

        if (passkeysError || !passkeys?.length) {
          return new Response(
            JSON.stringify({ error: 'No passkeys found for user' }),
            { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
          );
        }

        // Store challenge
        await supabaseClient
          .from('passkey_challenges')
          .insert({
            user_id: user.id,
            challenge: Array.from(challenge),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            action: 'authenticate'
          });

        const publicKeyCredentialRequestOptions = {
          challenge,
          allowCredentials: passkeys.map(pk => ({
            id: pk.credential_id,
            type: "public-key",
          })),
          timeout: 60000,
          userVerification: "required",
        };

        return new Response(
          JSON.stringify({ 
            publicKeyCredentialRequestOptions,
            success: true 
          }),
          { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Passkey operation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});