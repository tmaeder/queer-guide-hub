import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/response';

export async function handleGetTurnstileConfig(
  req: Request,
  env: Env,
): Promise<Response> {
  // Verify authentication via JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Authentication required', 401);

  const token = authHeader.replace('Bearer ', '');
  try {
    const { verifyToken } = await import('../lib/jwt');
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload) return errorResponse('Invalid authentication', 401);
  } catch {
    return errorResponse('Authentication failed', 401);
  }

  if (!env.TURNSTILE_SITE_KEY) {
    return errorResponse('Turnstile not configured', 500);
  }

  return jsonResponse({ siteKey: env.TURNSTILE_SITE_KEY, version: '1.0' }, 200);
}

export async function handleVerifyTurnstile(
  req: Request,
  env: Env,
): Promise<Response> {
  try {
    const { token, action = 'login' } = await req.json<{ token?: string; action?: string }>();

    if (!token) {
      return jsonResponse({ success: false, error: 'Token is required' }, 400);
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return jsonResponse({ success: false, error: 'Turnstile not configured' }, 500);
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
      );
    }

    return jsonResponse(
      { success: false, error: 'Captcha verification failed', errorCodes: verifyResult['error-codes'] },
      400,
    );
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return jsonResponse({ success: false, error: 'Internal server error' }, 500);
  }
}
