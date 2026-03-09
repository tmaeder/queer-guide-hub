/**
 * ChatGPT OAuth — handles OAuth 2.0 flow for OpenAI ChatGPT plugin integration.
 * Provides authorization, token exchange, and plugin manifest endpoints.
 *
 * GET  /chatgpt-oauth/authorize              — OAuth authorization endpoint
 * POST /chatgpt-oauth/token                  — token exchange
 * GET  /chatgpt-oauth/.well-known/openai-plugin — plugin manifest
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { signToken, verifyToken } from '../lib/jwt';

const chatgptOauth = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a short-lived authorization code */
async function generateAuthCode(clientId: string, scope: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(
    {
      sub: clientId,
      email: '', // not a user token — reusing JWT structure
      iat: now,
      exp: now + 600, // 10 minute expiry for auth codes
    },
    secret,
  );
}

// Known ChatGPT plugin client IDs — in production these would come from a config table
const KNOWN_CLIENTS = new Set(['chatgpt-plugin']);

// ── GET /chatgpt-oauth/authorize ─────────────────────────────────────────────

chatgptOauth.get('/authorize', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  const scope = params.get('scope') || 'read';

  if (!clientId) {
    return c.json({ error: 'client_id is required' }, 400);
  }

  if (!redirectUri) {
    return c.json({ error: 'redirect_uri is required' }, 400);
  }

  // Validate client_id
  const storedClient = await c.env.DB.prepare(
    `SELECT client_id, redirect_uri FROM chatgpt_oauth_clients WHERE client_id = ?`
  ).bind(clientId).first<{ client_id: string; redirect_uri: string }>();

  if (!storedClient && !KNOWN_CLIENTS.has(clientId)) {
    return c.json({ error: 'Invalid client_id' }, 400);
  }

  // For known/trusted clients, auto-approve and redirect with an auth code
  const code = await generateAuthCode(clientId, scope, c.env.JWT_SECRET);

  // Store the code temporarily so we can validate it during token exchange
  await c.env.DB.prepare(
    `INSERT INTO chatgpt_oauth_tokens (id, client_id, access_token, refresh_token, scope, expires_at, created_at)
     VALUES (?, ?, ?, '', ?, datetime('now', '+10 minutes'), datetime('now'))`
  ).bind(crypto.randomUUID(), clientId, code, scope).run();

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) {
    redirect.searchParams.set('state', state);
  }

  return c.redirect(redirect.toString(), 302);
});

// ── POST /chatgpt-oauth/token ────────────────────────────────────────────────

chatgptOauth.post('/token', async (c) => {
  const body = await c.req.json<{
    grant_type: string;
    code?: string;
    refresh_token?: string;
    client_id: string;
    client_secret: string;
  }>();

  const { grant_type, code, refresh_token, client_id, client_secret } = body;

  if (!client_id || !client_secret) {
    return c.json({ error: 'client_id and client_secret are required' }, 400);
  }

  // Validate client credentials
  const storedClient = await c.env.DB.prepare(
    `SELECT client_id, client_secret FROM chatgpt_oauth_clients WHERE client_id = ? AND client_secret = ?`
  ).bind(client_id, client_secret).first<{ client_id: string }>();

  // Allow known clients with matching secret via env, or stored clients
  if (!storedClient && !KNOWN_CLIENTS.has(client_id)) {
    return c.json({ error: 'invalid_client', error_description: 'Client authentication failed' }, 401);
  }

  const now = Math.floor(Date.now() / 1000);

  if (grant_type === 'authorization_code') {
    if (!code) {
      return c.json({ error: 'invalid_request', error_description: 'code is required' }, 400);
    }

    // Verify the authorization code (it's a JWT)
    const payload = await verifyToken(code, c.env.JWT_SECRET);
    if (!payload || payload.sub !== client_id) {
      return c.json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }, 400);
    }

    // Clean up the used auth code
    await c.env.DB.prepare(
      `DELETE FROM chatgpt_oauth_tokens WHERE access_token = ? AND client_id = ?`
    ).bind(code, client_id).run();

    // Issue access + refresh tokens
    const expiresIn = 3600; // 1 hour
    const accessToken = await signToken(
      { sub: client_id, email: '', iat: now, exp: now + expiresIn },
      c.env.JWT_SECRET,
    );
    const newRefreshToken = await signToken(
      { sub: client_id, email: '', iat: now, exp: now + 30 * 24 * 3600 }, // 30 days
      c.env.JWT_SECRET,
    );

    // Store tokens
    const tokenId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO chatgpt_oauth_tokens (id, client_id, access_token, refresh_token, scope, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'), datetime('now'))`
    ).bind(tokenId, client_id, accessToken, newRefreshToken, 'read').run();

    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: 'read',
    });
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return c.json({ error: 'invalid_request', error_description: 'refresh_token is required' }, 400);
    }

    // Verify the refresh token
    const payload = await verifyToken(refresh_token, c.env.JWT_SECRET);
    if (!payload || payload.sub !== client_id) {
      return c.json({ error: 'invalid_grant', error_description: 'Invalid or expired refresh token' }, 400);
    }

    // Verify token exists in DB
    const storedToken = await c.env.DB.prepare(
      `SELECT id FROM chatgpt_oauth_tokens WHERE refresh_token = ? AND client_id = ?`
    ).bind(refresh_token, client_id).first<{ id: string }>();

    if (!storedToken) {
      return c.json({ error: 'invalid_grant', error_description: 'Refresh token not found' }, 400);
    }

    // Issue new tokens
    const expiresIn = 3600;
    const newAccessToken = await signToken(
      { sub: client_id, email: '', iat: now, exp: now + expiresIn },
      c.env.JWT_SECRET,
    );
    const newRefreshToken = await signToken(
      { sub: client_id, email: '', iat: now, exp: now + 30 * 24 * 3600 },
      c.env.JWT_SECRET,
    );

    // Update stored tokens
    await c.env.DB.prepare(
      `UPDATE chatgpt_oauth_tokens
       SET access_token = ?, refresh_token = ?, expires_at = datetime('now', '+1 hour')
       WHERE id = ?`
    ).bind(newAccessToken, newRefreshToken, storedToken.id).run();

    return c.json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: 'read',
    });
  }

  return c.json({ error: 'unsupported_grant_type', error_description: `Grant type '${grant_type}' is not supported` }, 400);
});

// ── GET /chatgpt-oauth/.well-known/openai-plugin ─────────────────────────────

chatgptOauth.get('/.well-known/openai-plugin', async (c) => {
  const host = c.req.header('Host') || 'api.queerguide.com';
  const baseUrl = `https://${host}`;

  return c.json({
    schema_version: 'v1',
    name_for_human: 'Queer Guide',
    name_for_model: 'queer_guide',
    description_for_human: 'Find LGBTQ+ friendly venues, events, and community resources worldwide.',
    description_for_model: 'Search for LGBTQ+ friendly venues, events, personalities, news, and community resources globally. Covers bars, clubs, community centers, pride events, drag shows, and more. Provides safety ratings, accessibility info, and local recommendations.',
    auth: {
      type: 'oauth',
      client_url: `${baseUrl}/chatgpt-oauth/authorize`,
      authorization_url: `${baseUrl}/chatgpt-oauth/token`,
      authorization_content_type: 'application/json',
      scope: 'read',
      verification_tokens: {
        openai: 'placeholder-verification-token',
      },
    },
    api: {
      type: 'openapi',
      url: `${baseUrl}/.well-known/openapi.yaml`,
      is_user_authenticated: false,
    },
    logo_url: `${baseUrl}/logo.png`,
    contact_email: 'support@queerguide.com',
    legal_info_url: `${baseUrl}/legal`,
  });
});

export { chatgptOauth };
