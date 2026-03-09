/**
 * API key management routes.
 * Migrated from supabase/functions/get-api-key and manage-api-keys.
 *
 * POST /api-keys/get    — generate / retrieve an API key (auth required)
 * POST /api-keys/manage — admin CRUD operations on API keys
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { secureEncrypt, secureDecrypt } from '../lib/encryption';

const apiKeys = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ---------------------------------------------------------------------------
// POST /api-keys/get — Get (or generate) an API key for a service
// ---------------------------------------------------------------------------
apiKeys.post('/get', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const { service_name } = await c.req.json<{ service_name: string }>();

  if (!service_name) {
    return c.json({ data: null, error: 'service_name is required' }, 400);
  }

  // Check for an existing active key for this user + service
  const existing = await c.env.DB.prepare(
    'SELECT id, key_prefix, created_at, last_used_at, expires_at FROM api_keys WHERE user_id = ? AND service_name = ? AND is_active = 1',
  )
    .bind(user.id, service_name)
    .first();

  if (existing) {
    return c.json({
      data: {
        message: 'An active key already exists for this service. For security the full key is only shown at creation time.',
        key_id: existing.id,
        key_prefix: existing.key_prefix,
        service_name,
        created_at: existing.created_at,
        last_used_at: existing.last_used_at,
        expires_at: existing.expires_at,
      },
      error: null,
    });
  }

  // Generate a new plaintext key
  const plainKey = `qgh_${crypto.randomUUID().replace(/-/g, '')}`;
  const keyPrefix = plainKey.slice(0, 8) + '...';

  // Encrypt before storing
  const masterKey = (c.env as any).MASTER_ENCRYPTION_KEY as string;
  if (!masterKey) {
    return c.json({ data: null, error: 'Encryption is not configured' }, 500);
  }
  const encryptedKey = await secureEncrypt(plainKey, masterKey);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO api_keys (id, user_id, service_name, encrypted_key, key_prefix, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(id, user.id, service_name, encryptedKey, keyPrefix, now)
    .run();

  return c.json({
    data: {
      key_id: id,
      key: plainKey, // Only returned once at creation
      key_prefix: keyPrefix,
      service_name,
      created_at: now,
      message: 'Store this key securely — it will not be shown again.',
    },
    error: null,
  }, 201);
});

// ---------------------------------------------------------------------------
// POST /api-keys/manage — Admin key management
// ---------------------------------------------------------------------------
apiKeys.post('/manage', requireAuth as any, requireAdmin as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json<{
    action: string;
    key_id?: string;
    service_name?: string;
    key_value?: string;
  }>();

  const { action, key_id, service_name, key_value } = body;

  if (!action) {
    return c.json({ data: null, error: 'action is required' }, 400);
  }

  const masterKey = (c.env as any).MASTER_ENCRYPTION_KEY as string;
  if (!masterKey) {
    return c.json({ data: null, error: 'Encryption is not configured' }, 500);
  }

  switch (action) {
    // ----- LIST -----
    case 'list': {
      const keys = await c.env.DB.prepare(
        'SELECT id, user_id, service_name, key_prefix, is_active, created_at, last_used_at, expires_at FROM api_keys ORDER BY created_at DESC',
      ).all();

      return c.json({ data: keys.results, error: null });
    }

    // ----- CREATE -----
    case 'create': {
      if (!service_name) {
        return c.json({ data: null, error: 'service_name is required for create' }, 400);
      }

      const plainKey = key_value || `qgh_${crypto.randomUUID().replace(/-/g, '')}`;
      const keyPrefix = plainKey.slice(0, 8) + '...';
      const encryptedKey = await secureEncrypt(plainKey, masterKey);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await c.env.DB.prepare(
        `INSERT INTO api_keys (id, user_id, service_name, encrypted_key, key_prefix, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
        .bind(id, user.id, service_name, encryptedKey, keyPrefix, now)
        .run();

      return c.json({
        data: {
          key_id: id,
          key: plainKey,
          key_prefix: keyPrefix,
          service_name,
          created_at: now,
        },
        error: null,
      }, 201);
    }

    // ----- ROTATE -----
    case 'rotate': {
      if (!key_id) {
        return c.json({ data: null, error: 'key_id is required for rotate' }, 400);
      }

      const existing = await c.env.DB.prepare(
        'SELECT id, service_name FROM api_keys WHERE id = ? AND is_active = 1',
      )
        .bind(key_id)
        .first<{ id: string; service_name: string }>();

      if (!existing) {
        return c.json({ data: null, error: 'Active key not found' }, 404);
      }

      // Invalidate the old key
      await c.env.DB.prepare(
        'UPDATE api_keys SET is_active = 0, expires_at = ? WHERE id = ?',
      )
        .bind(new Date().toISOString(), key_id)
        .run();

      // Create a new key for the same service
      const newPlainKey = key_value || `qgh_${crypto.randomUUID().replace(/-/g, '')}`;
      const newPrefix = newPlainKey.slice(0, 8) + '...';
      const newEncrypted = await secureEncrypt(newPlainKey, masterKey);

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      await c.env.DB.prepare(
        `INSERT INTO api_keys (id, user_id, service_name, encrypted_key, key_prefix, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
        .bind(newId, user.id, existing.service_name, newEncrypted, newPrefix, now)
        .run();

      return c.json({
        data: {
          old_key_id: key_id,
          new_key_id: newId,
          key: newPlainKey,
          key_prefix: newPrefix,
          service_name: existing.service_name,
          created_at: now,
          message: 'Old key has been invalidated. Store the new key securely.',
        },
        error: null,
      });
    }

    // ----- DELETE -----
    case 'delete': {
      if (!key_id) {
        return c.json({ data: null, error: 'key_id is required for delete' }, 400);
      }

      const result = await c.env.DB.prepare(
        'DELETE FROM api_keys WHERE id = ?',
      )
        .bind(key_id)
        .run();

      if (!result.meta.changes) {
        return c.json({ data: null, error: 'Key not found' }, 404);
      }

      return c.json({ data: { deleted: key_id }, error: null });
    }

    // ----- GET (decrypted) -----
    case 'get': {
      if (!key_id) {
        return c.json({ data: null, error: 'key_id is required for get' }, 400);
      }

      const row = await c.env.DB.prepare(
        'SELECT id, user_id, service_name, encrypted_key, key_prefix, is_active, created_at, last_used_at, expires_at FROM api_keys WHERE id = ?',
      )
        .bind(key_id)
        .first<{
          id: string;
          user_id: string;
          service_name: string;
          encrypted_key: string;
          key_prefix: string;
          is_active: number;
          created_at: string;
          last_used_at: string | null;
          expires_at: string | null;
        }>();

      if (!row) {
        return c.json({ data: null, error: 'Key not found' }, 404);
      }

      const decryptedKey = await secureDecrypt(row.encrypted_key, masterKey);

      return c.json({
        data: {
          key_id: row.id,
          user_id: row.user_id,
          service_name: row.service_name,
          key: decryptedKey,
          key_prefix: row.key_prefix,
          is_active: row.is_active,
          created_at: row.created_at,
          last_used_at: row.last_used_at,
          expires_at: row.expires_at,
        },
        error: null,
      });
    }

    default:
      return c.json({ data: null, error: `Unknown action: ${action}` }, 400);
  }
});

export { apiKeys };
