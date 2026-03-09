/**
 * Admin routes — user creation and passkey management.
 *
 * POST /admin/create-user   — create a new user (admin only)
 * POST /admin/passkey        — passkey credential operations (admin only)
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { hashPassword } from '../lib/password';

const admin = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// All admin routes require auth + admin role
admin.use('/*', requireAuth, requireAdmin);

// ---------------------------------------------------------------------------
// POST /admin/create-user
// ---------------------------------------------------------------------------
admin.post('/create-user', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    display_name?: string;
    first_name?: string;
    last_name?: string;
    pronouns?: string;
    location?: string;
    roles?: string[];
  }>();

  // Validate required fields
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  if (body.password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const email = body.email.toLowerCase().trim();

  // Check if email already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (existing) {
    return c.json({ error: 'User with this email already exists' }, 409);
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(body.password);

  const metadata = {
    display_name: body.display_name || '',
    first_name: body.first_name || '',
    last_name: body.last_name || '',
    pronouns: body.pronouns || '',
    location: body.location || '',
  };

  // Create user row
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    userId,
    email,
    passwordHash,
    JSON.stringify(metadata),
    now,
    now,
  ).run();

  // Create profile row
  const displayName = body.display_name || body.first_name || '';

  await c.env.DB.prepare(
    `INSERT INTO profiles (id, user_id, display_name, pronouns, location, bio, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    displayName,
    body.pronouns || null,
    body.location || null,
    null,
    now,
    now,
  ).run();

  // Assign roles if provided
  if (body.roles && body.roles.length > 0) {
    for (const role of body.roles) {
      await c.env.DB.prepare(
        `INSERT INTO user_roles (id, user_id, role, created_at)
         VALUES (?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        userId,
        role,
        now,
      ).run();
    }
  }

  // Fetch the created user for the response
  const createdUser = await c.env.DB.prepare(
    'SELECT id, email, raw_user_meta_data, created_at FROM users WHERE id = ?'
  ).bind(userId).first<{
    id: string;
    email: string;
    raw_user_meta_data: string;
    created_at: string;
  }>();

  return c.json({
    data: {
      user: {
        id: userId,
        email,
        user_metadata: metadata,
        created_at: createdUser?.created_at || now,
      },
      roles: body.roles || [],
    },
    error: null,
  }, 201);
});

// ---------------------------------------------------------------------------
// POST /admin/passkey
// ---------------------------------------------------------------------------
admin.post('/passkey', async (c) => {
  const body = await c.req.json<{
    operation: string;
    user_id?: string;
    credential_id?: string;
    credential?: {
      credential_id: string;
      public_key: string;
      counter?: number;
    };
  }>();

  if (!body.operation) {
    return c.json({ error: 'Operation is required' }, 400);
  }

  switch (body.operation) {
    // ----- register-begin -----
    case 'register-begin': {
      if (!body.user_id) {
        return c.json({ error: 'user_id is required' }, 400);
      }

      // Verify user exists
      const user = await c.env.DB.prepare(
        'SELECT id, email FROM users WHERE id = ?'
      ).bind(body.user_id).first<{ id: string; email: string }>();

      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      // Generate a challenge for the client
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const challengeB64 = btoa(String.fromCharCode(...challenge));

      // Store challenge temporarily in KV (5 min TTL)
      await c.env.SESSIONS.put(
        `passkey-challenge:${body.user_id}`,
        challengeB64,
        { expirationTtl: 300 },
      );

      // Fetch existing credentials to exclude
      const existing = await c.env.DB.prepare(
        'SELECT credential_id FROM passkey_credentials WHERE user_id = ?'
      ).bind(body.user_id).all<{ credential_id: string }>();

      return c.json({
        data: {
          challenge: challengeB64,
          user: {
            id: user.id,
            name: user.email,
            displayName: user.email,
          },
          excludeCredentials: (existing.results || []).map((cred) => ({
            id: cred.credential_id,
            type: 'public-key' as const,
          })),
        },
        error: null,
      });
    }

    // ----- register-finish -----
    case 'register-finish': {
      if (!body.user_id || !body.credential) {
        return c.json({ error: 'user_id and credential are required' }, 400);
      }

      // Verify the challenge was issued
      const storedChallenge = await c.env.SESSIONS.get(`passkey-challenge:${body.user_id}`);
      if (!storedChallenge) {
        return c.json({ error: 'No pending registration challenge found' }, 400);
      }

      // Clean up challenge
      await c.env.SESSIONS.delete(`passkey-challenge:${body.user_id}`);

      // Check for duplicate credential
      const duplicate = await c.env.DB.prepare(
        'SELECT id FROM passkey_credentials WHERE credential_id = ?'
      ).bind(body.credential.credential_id).first();

      if (duplicate) {
        return c.json({ error: 'Credential already registered' }, 409);
      }

      const now = new Date().toISOString();

      // Store the credential
      await c.env.DB.prepare(
        `INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, counter, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        body.user_id,
        body.credential.credential_id,
        body.credential.public_key,
        body.credential.counter ?? 0,
        now,
      ).run();

      return c.json({
        data: { registered: true, credential_id: body.credential.credential_id },
        error: null,
      }, 201);
    }

    // ----- authenticate-begin -----
    case 'authenticate-begin': {
      if (!body.user_id) {
        return c.json({ error: 'user_id is required' }, 400);
      }

      // Fetch user credentials
      const credentials = await c.env.DB.prepare(
        'SELECT credential_id FROM passkey_credentials WHERE user_id = ?'
      ).bind(body.user_id).all<{ credential_id: string }>();

      if (!credentials.results || credentials.results.length === 0) {
        return c.json({ error: 'No passkey credentials found for this user' }, 404);
      }

      // Generate a challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const challengeB64 = btoa(String.fromCharCode(...challenge));

      await c.env.SESSIONS.put(
        `passkey-auth-challenge:${body.user_id}`,
        challengeB64,
        { expirationTtl: 300 },
      );

      return c.json({
        data: {
          challenge: challengeB64,
          allowCredentials: credentials.results.map((cred) => ({
            id: cred.credential_id,
            type: 'public-key' as const,
          })),
        },
        error: null,
      });
    }

    // ----- authenticate-finish -----
    case 'authenticate-finish': {
      if (!body.user_id || !body.credential_id) {
        return c.json({ error: 'user_id and credential_id are required' }, 400);
      }

      // Verify the challenge was issued
      const storedAuthChallenge = await c.env.SESSIONS.get(`passkey-auth-challenge:${body.user_id}`);
      if (!storedAuthChallenge) {
        return c.json({ error: 'No pending authentication challenge found' }, 400);
      }

      // Clean up challenge
      await c.env.SESSIONS.delete(`passkey-auth-challenge:${body.user_id}`);

      // Look up the credential
      const credential = await c.env.DB.prepare(
        'SELECT id, user_id, credential_id, public_key, counter FROM passkey_credentials WHERE credential_id = ? AND user_id = ?'
      ).bind(body.credential_id, body.user_id).first<{
        id: string;
        user_id: string;
        credential_id: string;
        public_key: string;
        counter: number;
      }>();

      if (!credential) {
        return c.json({ error: 'Credential not found' }, 404);
      }

      // Increment counter (replay protection)
      const newCounter = credential.counter + 1;
      await c.env.DB.prepare(
        'UPDATE passkey_credentials SET counter = ? WHERE id = ?'
      ).bind(newCounter, credential.id).run();

      return c.json({
        data: {
          authenticated: true,
          user_id: credential.user_id,
          credential_id: credential.credential_id,
        },
        error: null,
      });
    }

    // ----- list -----
    case 'list': {
      if (!body.user_id) {
        return c.json({ error: 'user_id is required' }, 400);
      }

      const credentials = await c.env.DB.prepare(
        'SELECT id, credential_id, counter, created_at FROM passkey_credentials WHERE user_id = ?'
      ).bind(body.user_id).all<{
        id: string;
        credential_id: string;
        counter: number;
        created_at: string;
      }>();

      return c.json({
        data: credentials.results || [],
        error: null,
      });
    }

    // ----- delete -----
    case 'delete': {
      if (!body.credential_id) {
        return c.json({ error: 'credential_id is required' }, 400);
      }

      const result = await c.env.DB.prepare(
        'DELETE FROM passkey_credentials WHERE credential_id = ?'
      ).bind(body.credential_id).run();

      return c.json({
        data: { deleted: true, changes: result.meta?.changes ?? 0 },
        error: null,
      });
    }

    default:
      return c.json({
        error: `Unknown operation: ${body.operation}. Supported: register-begin, register-finish, authenticate-begin, authenticate-finish, list, delete`,
      }, 400);
  }
});

export { admin };
