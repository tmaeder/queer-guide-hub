import { Context, Next } from 'hono';
import type { Env, AuthUser } from '../types';
import { verifyToken } from '../lib/jwt';

/**
 * Auth middleware — verifies JWT and sets c.var.user.
 * Use `requireAuth` for protected routes, `optionalAuth` for public routes
 * that benefit from knowing the user.
 */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const token = header.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Fetch roles from D1
  const roles = await c.env.DB.prepare(
    'SELECT role FROM user_roles WHERE user_id = ?'
  ).bind(payload.sub).all<{ role: string }>();

  c.set('user', {
    id: payload.sub,
    email: payload.email,
    roles: roles.results?.map((r) => r.role) || [],
  });

  await next();
}

export async function optionalAuth(c: Context<{ Bindings: Env; Variables: { user: AuthUser | null } }>, next: Next) {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) {
      const roles = await c.env.DB.prepare(
        'SELECT role FROM user_roles WHERE user_id = ?'
      ).bind(payload.sub).all<{ role: string }>();

      c.set('user', {
        id: payload.sub,
        email: payload.email,
        roles: roles.results?.map((r) => r.role) || [],
      });
    } else {
      c.set('user', null);
    }
  } else {
    c.set('user', null);
  }

  await next();
}

export async function requireAdmin(c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) {
  // requireAuth must run first
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const isAdmin = user.roles.some((r) => r === 'admin' || r === 'canManageContent');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
}
