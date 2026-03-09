import type { Env } from './types';

/**
 * Verify the request comes from an authenticated admin user.
 * Calls Supabase Auth to validate the JWT and checks user_roles.
 * Returns null if authorized, or an error message string.
 */
export async function requireAdmin(
  req: Request,
  env: Env,
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return 'Authentication required';

  const token = authHeader.replace('Bearer ', '');
  if (!token) return 'Invalid token';

  try {
    // Verify user via Supabase Auth
    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!userResp.ok) return 'Invalid authentication';
    const user = (await userResp.json()) as { id?: string };
    if (!user?.id) return 'Invalid user';

    // Check admin role
    const rolesResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user.id}&select=role`,
      {
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        },
      },
    );

    if (!rolesResp.ok) return 'Failed to verify permissions';

    const roles = (await rolesResp.json()) as Array<{ role: string }>;
    const isAdmin = roles.some(
      (r) => r.role === 'admin' || r.role === 'canManageContent',
    );
    if (!isAdmin) return 'Admin access required';

    return null; // Authorized
  } catch (err) {
    console.error('Auth error:', err);
    return 'Authentication failed';
  }
}
