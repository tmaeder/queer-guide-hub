import { getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from 'https://esm.sh/@simplewebauthn/server@13.3.0?target=deno';
import { isoBase64URL } from 'https://esm.sh/@simplewebauthn/server@13.3.0/helpers?target=deno';

// Relying Party identity. RP ID must be a registrable suffix of the origin —
// 'queer.guide' covers both apex and www. Passkeys are intentionally
// unsupported on localhost (the client blocks them in iframes/preview).
const RP_ID = 'queer.guide';
const RP_NAME = 'Queer Guide';
const EXPECTED_ORIGINS = ['https://queer.guide', 'https://www.queer.guide'];

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient();

  try {
    const { action, credentialData, challengeId } = await req.json();

    // ---- Authenticated actions (user must be signed in to manage passkeys) ----
    if (action === 'enroll' || action === 'verify-enrollment') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json(req, { error: 'Missing authorization header' }, 401);

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', ''),
      );
      if (authError || !user) return json(req, { error: 'Invalid authentication' }, 401);

      if (action === 'enroll') {
        // Don't offer to register a credential the user already has.
        const { data: existing } = await supabase
          .from('user_passkeys')
          .select('credential_id, transports')
          .eq('user_id', user.id)
          .eq('is_revoked', false);

        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: RP_ID,
          // userID becomes the credential's userHandle, enabling discoverable
          // (usernameless) sign-in later. Tie it to the Supabase user id.
          userID: new TextEncoder().encode(user.id),
          userName: user.email ?? user.id,
          userDisplayName: user.email ?? 'Queer Guide user',
          attestationType: 'none',
          excludeCredentials: (existing ?? []).map((c) => ({
            id: c.credential_id as string,
            transports: (c.transports as AuthenticatorTransport[] | null) ?? undefined,
          })),
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
          },
          timeout: 60000,
        });

        await supabase.from('passkey_challenges').insert({
          user_id: user.id,
          challenge_b64: options.challenge,
          action: 'enroll',
          expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
        });

        return json(req, { options, success: true });
      }

      // verify-enrollment
      const { data: challengeRow, error: challengeError } = await supabase
        .from('passkey_challenges')
        .select('id, challenge_b64')
        .eq('user_id', user.id)
        .eq('action', 'enroll')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError || !challengeRow?.challenge_b64) {
        return json(req, { error: 'Invalid or expired challenge' }, 400);
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credentialData,
          expectedChallenge: challengeRow.challenge_b64,
          expectedOrigin: EXPECTED_ORIGINS,
          expectedRPID: RP_ID,
          requireUserVerification: true,
        });
      } catch (e) {
        return json(req, { error: `Verification failed: ${String(e)}` }, 400);
      }

      if (!verification.verified || !verification.registrationInfo) {
        return json(req, { error: 'Passkey verification failed' }, 400);
      }

      const { credential, aaguid } = verification.registrationInfo;

      const { error: storeError } = await supabase.from('user_passkeys').insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key_b64: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        aaguid: aaguid ?? null,
        is_revoked: false,
        created_at: new Date().toISOString(),
      });
      if (storeError) throw storeError;

      await supabase.from('user_passkey_enrollment').upsert({
        user_id: user.id,
        is_enrolled: true,
        enrolled_at: new Date().toISOString(),
        device_name: 'WebAuthn Device',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      await supabase.from('passkey_challenges').delete().eq('id', challengeRow.id);

      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'PASSKEY_ENROLLED_SECURE',
        p_user_id: user.id,
        p_metadata: { credential_id: credential.id, timestamp: new Date().toISOString() },
        p_severity: 'info',
      });

      return json(req, { success: true });
    }

    // ---- Unauthenticated actions (sign-in with a passkey) ----
    if (action === 'authenticate') {
      // Discoverable credentials: the browser surfaces the user's resident
      // keys, so we issue a user-less challenge and let the assertion identify
      // the credential.
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: 'required',
        allowCredentials: [],
      });

      const { data: inserted, error: insertError } = await supabase
        .from('passkey_challenges')
        .insert({
          user_id: null,
          challenge_b64: options.challenge,
          action: 'authenticate',
          expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !inserted) throw insertError ?? new Error('challenge insert failed');

      return json(req, { options, challengeId: inserted.id, success: true });
    }

    if (action === 'verify-authentication') {
      if (!credentialData?.id || !challengeId) {
        return json(req, { error: 'Missing credential or challenge id' }, 400);
      }

      // Identify the credential from the assertion id.
      const { data: passkey, error: passkeyError } = await supabase
        .from('user_passkeys')
        .select('id, user_id, public_key_b64, counter, transports, is_revoked')
        .eq('credential_id', credentialData.id)
        .maybeSingle();

      if (passkeyError || !passkey) return json(req, { error: 'Unknown passkey' }, 404);
      if (passkey.is_revoked) return json(req, { error: 'Passkey revoked' }, 403);
      if (!passkey.public_key_b64) return json(req, { error: 'Passkey not verifiable' }, 409);

      const { data: challengeRow, error: challengeError } = await supabase
        .from('passkey_challenges')
        .select('id, challenge_b64')
        .eq('id', challengeId)
        .eq('action', 'authenticate')
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (challengeError || !challengeRow?.challenge_b64) {
        return json(req, { error: 'Invalid or expired challenge' }, 400);
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: credentialData,
          expectedChallenge: challengeRow.challenge_b64,
          expectedOrigin: EXPECTED_ORIGINS,
          expectedRPID: RP_ID,
          requireUserVerification: true,
          credential: {
            id: credentialData.id,
            publicKey: isoBase64URL.toBuffer(passkey.public_key_b64),
            counter: Number(passkey.counter),
            transports: (passkey.transports as AuthenticatorTransport[] | null) ?? undefined,
          },
        });
      } catch (e) {
        return json(req, { error: `Verification failed: ${String(e)}` }, 400);
      }

      if (!verification.verified) {
        return json(req, { error: 'Passkey authentication failed' }, 400);
      }

      await supabase
        .from('user_passkeys')
        .update({
          counter: verification.authenticationInfo.newCounter,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', passkey.id);

      await supabase.from('passkey_challenges').delete().eq('id', challengeRow.id);

      // Bridge the verified assertion to a real Supabase session. There is no
      // direct "mint session" admin API, so we generate a magic-link OTP for
      // the credential's owner and hand it back for the client to verify.
      const { data: userRow, error: userErr } = await supabase.auth.admin.getUserById(
        passkey.user_id as string,
      );
      if (userErr || !userRow?.user?.email) {
        return json(req, { error: 'Account has no email for session bridge' }, 409);
      }
      const email = userRow.user.email;

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (linkError || !linkData?.properties?.email_otp) {
        throw linkError ?? new Error('failed to mint session token');
      }

      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'PASSKEY_SIGNIN_SUCCESS',
        p_user_id: passkey.user_id,
        p_metadata: { credential_id: credentialData.id, timestamp: new Date().toISOString() },
        p_severity: 'info',
      });

      return json(req, { success: true, email, otp: linkData.properties.email_otp });
    }

    return json(req, { error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Passkey operation error:', error);
    try {
      await supabase.rpc('log_enhanced_security_event', {
        p_event_type: 'PASSKEY_OPERATION_FAILED',
        p_user_id: null,
        p_metadata: { error: String(error), timestamp: new Date().toISOString() },
        p_severity: 'medium',
      });
    } catch (_logError) {
      // Don't let logging failures mask the original error.
    }
    return json(req, { error: 'Internal server error' }, 500);
  }
});
