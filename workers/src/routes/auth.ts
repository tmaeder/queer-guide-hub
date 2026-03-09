/**
 * Auth routes — replaces Supabase Auth.
 *
 * POST /auth/signup    — register new user
 * POST /auth/signin    — email + password login
 * POST /auth/signout   — invalidate refresh token
 * POST /auth/refresh   — get new access token
 * GET  /auth/user      — get current user info
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { hashPassword, verifyPassword } from '../lib/password';
import { createTokenPair, verifyToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

auth.post('/signup', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
  }>();

  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  if (body.password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  // Check if email already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(body.email.toLowerCase()).first();

  if (existing) {
    return c.json({ error: 'User already registered' }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(body.password);

  // Create user
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.email.toLowerCase(),
    passwordHash,
    JSON.stringify(body.metadata || {}),
    now,
    now,
  ).run();

  // Create profile
  const displayName = (body.metadata as Record<string, string>)?.display_name ||
    (body.metadata as Record<string, string>)?.first_name || '';

  await c.env.DB.prepare(
    `INSERT INTO profiles (id, user_id, display_name, pronouns, location, bio, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    id,
    displayName,
    (body.metadata as Record<string, string>)?.pronouns || null,
    (body.metadata as Record<string, string>)?.location || null,
    (body.metadata as Record<string, string>)?.bio || null,
    now,
    now,
  ).run();

  // Issue tokens
  const tokens = await createTokenPair(id, body.email.toLowerCase(), c.env.JWT_SECRET);

  // Store refresh token in KV
  await c.env.SESSIONS.put(`refresh:${id}`, tokens.refreshToken, {
    expirationTtl: 30 * 24 * 3600,
  });

  return c.json({
    data: {
      user: { id, email: body.email.toLowerCase(), user_metadata: body.metadata || {} },
      session: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        token_type: 'bearer',
      },
    },
    error: null,
  });
});

auth.post('/signin', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, encrypted_password, raw_user_meta_data FROM users WHERE email = ?'
  ).bind(body.email.toLowerCase()).first<{
    id: string;
    email: string;
    encrypted_password: string;
    raw_user_meta_data: string;
  }>();

  if (!user) {
    return c.json({ error: 'Invalid login credentials' }, 400);
  }

  const valid = await verifyPassword(body.password, user.encrypted_password);
  if (!valid) {
    // Log failed attempt
    await c.env.DB.prepare(
      `INSERT INTO failed_login_attempts (id, email, ip_address, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      body.email.toLowerCase(),
      c.req.header('CF-Connecting-IP') || 'unknown',
      new Date().toISOString(),
    ).run().catch(() => {}); // best-effort

    return c.json({ error: 'Invalid login credentials' }, 400);
  }

  const tokens = await createTokenPair(user.id, user.email, c.env.JWT_SECRET);

  await c.env.SESSIONS.put(`refresh:${user.id}`, tokens.refreshToken, {
    expirationTtl: 30 * 24 * 3600,
  });

  const metadata = user.raw_user_meta_data ? JSON.parse(user.raw_user_meta_data) : {};

  return c.json({
    data: {
      user: { id: user.id, email: user.email, user_metadata: metadata },
      session: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        token_type: 'bearer',
      },
    },
    error: null,
  });
});

auth.post('/signout', requireAuth, async (c) => {
  const user = c.get('user');
  await c.env.SESSIONS.delete(`refresh:${user.id}`);
  return c.json({ error: null });
});

auth.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  if (!body.refresh_token) {
    return c.json({ error: 'Refresh token required' }, 400);
  }

  const payload = await verifyToken(body.refresh_token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Invalid refresh token' }, 401);
  }

  // Check stored refresh token matches
  const stored = await c.env.SESSIONS.get(`refresh:${payload.sub}`);
  if (stored !== body.refresh_token) {
    return c.json({ error: 'Refresh token revoked' }, 401);
  }

  const tokens = await createTokenPair(payload.sub, payload.email, c.env.JWT_SECRET);

  await c.env.SESSIONS.put(`refresh:${payload.sub}`, tokens.refreshToken, {
    expirationTtl: 30 * 24 * 3600,
  });

  return c.json({
    data: {
      session: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: tokens.expiresIn,
        token_type: 'bearer',
      },
    },
    error: null,
  });
});

auth.get('/user', requireAuth, async (c) => {
  const user = c.get('user');

  const dbUser = await c.env.DB.prepare(
    'SELECT id, email, raw_user_meta_data, created_at FROM users WHERE id = ?'
  ).bind(user.id).first<{
    id: string;
    email: string;
    raw_user_meta_data: string;
    created_at: string;
  }>();

  if (!dbUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  const metadata = dbUser.raw_user_meta_data ? JSON.parse(dbUser.raw_user_meta_data) : {};

  return c.json({
    data: {
      id: dbUser.id,
      email: dbUser.email,
      user_metadata: metadata,
      created_at: dbUser.created_at,
      role: user.roles.includes('admin') ? 'admin' : 'authenticated',
    },
    error: null,
  });
});

export { auth };
