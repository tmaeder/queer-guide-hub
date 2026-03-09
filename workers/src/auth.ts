/**
 * Legacy auth helper — re-exported for backward compatibility.
 * New code should use middleware/auth.ts instead.
 */
import type { Env } from './types';
import { verifyToken } from './lib/jwt';

export async function requireAdmin(
  req: Request,
  env: Env,
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return 'Authentication required';

  const token = authHeader.replace('Bearer ', '');
  if (!token) return 'Invalid token';

  try {
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload) return 'Invalid authentication';

    // Check admin role in D1
    const roles = await env.DB.prepare(
      'SELECT role FROM user_roles WHERE user_id = ?'
    ).bind(payload.sub).all<{ role: string }>();

    const isAdmin = roles.results?.some(
      (r) => r.role === 'admin' || r.role === 'canManageContent',
    );
    if (!isAdmin) return 'Admin access required';

    return null;
  } catch (err) {
    console.error('Auth error:', err);
    return 'Authentication failed';
  }
}
