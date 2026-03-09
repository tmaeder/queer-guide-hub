/**
 * KV cache routes — replaces Redis/Upstash edge functions.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth } from '../middleware/auth';

const kv = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

kv.post('/get', async (c) => {
  const { key } = await c.req.json<{ key: string }>();
  if (!key) return c.json({ error: 'Key required' }, 400);

  const value = await c.env.CACHE.get(key);
  return c.json({ data: value ? JSON.parse(value) : null, error: null });
});

kv.post('/set', requireAuth, async (c) => {
  const { key, value, ttl } = await c.req.json<{
    key: string;
    value: unknown;
    ttl?: number;
  }>();

  if (!key) return c.json({ error: 'Key required' }, 400);

  await c.env.CACHE.put(key, JSON.stringify(value), {
    expirationTtl: ttl || 3600,
  });

  return c.json({ data: 'OK', error: null });
});

kv.post('/delete', requireAuth, async (c) => {
  const { key } = await c.req.json<{ key: string }>();
  if (!key) return c.json({ error: 'Key required' }, 400);

  await c.env.CACHE.delete(key);
  return c.json({ data: 'OK', error: null });
});

kv.post('/keys', requireAuth, async (c) => {
  const { prefix } = await c.req.json<{ prefix?: string }>();
  const list = await c.env.CACHE.list({ prefix: prefix || '' });
  return c.json({
    data: list.keys.map((k) => k.name),
    error: null,
  });
});

export { kv };
