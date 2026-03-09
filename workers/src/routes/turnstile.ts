import type { Env } from '../types';
import { jsonResponse, errorResponse, corsResponse } from '../cors';

export async function handleGetTurnstileConfig(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  // Verify authentication via JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Authentication required', 401, req, env);

  const token = authHeader.replace('Bearer ', '');
  try {
    const { verifyToken } = await import('../lib/jwt');
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload) return errorResponse('Invalid authentication', 401, req, env);
  } catch {
    return errorResponse('Authentication failed', 401, req, env);
  }

  if (!env.TURNSTILE_SITE_KEY) {
    return errorResponse('Turnstile not configured', 500, req, env);
  }

  return jsonResponse({ siteKey: env.TURNSTILE_SITE_KEY, version: '1.0' }, 200, req, env);
}

export async function handleVerifyTurnstile(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  try {
    const { token, action = 'login' } = await req.json<{ token?: string; action?: string }>();

    if (!token) {
      return jsonResponse({ success: false, error: 'Token is required' }, 400, req, env);
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return jsonResponse({ success: false, error: 'Turnstile not configured' }, 500, req, env);
    }

    const clientIP =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1';

    // Verify with Cloudflare Turnstile API directly
    const formData = new FormData();
    formData.append('secret', env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    formData.append('remoteip', clientIP);

    const verifyResp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: formData },
    );

    const verifyResult = await verifyResp.json<{
      success: boolean;
      action?: string;
      'error-codes'?: string[];
    }>();

    if (verifyResult.success) {
      return jsonResponse(
        { success: true, message: 'Captcha verified successfully', action: verifyResult.action },
        200,
        req,
        env,
      );
    }

    return jsonResponse(
      { success: false, error: 'Captcha verification failed', errorCodes: verifyResult['error-codes'] },
      400,
      req,
      env,
    );
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return jsonResponse({ success: false, error: 'Internal server error' }, 500, req, env);
  }
}
