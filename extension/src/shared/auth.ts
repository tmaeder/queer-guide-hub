import type { AuthSession } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STORAGE_KEY = "qg_session_v1";

/**
 * Minimal Supabase Auth client adapted for chrome.storage.local. We do not
 * use @supabase/supabase-js directly — its localStorage adapter does not
 * map cleanly onto MV3 service workers, and we only need three operations:
 * sendMagicLink, exchangeCodeForSession, getValidAccessToken (with refresh).
 */

export async function sendMagicLink(email: string, redirectTo: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, options: { emailRedirectTo: redirectTo } }),
  });
  if (!res.ok) throw new Error(`magic link failed ${res.status}: ${await res.text()}`);
}

export async function exchangeCodeForSession(code: string): Promise<AuthSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ auth_code: code }),
  });
  if (!res.ok) throw new Error(`code exchange failed ${res.status}`);
  return await persist(await res.json());
}

export async function getValidAccessToken(): Promise<string | null> {
  const session = await loadSession();
  if (!session) return null;
  if (session.expires_at - 30 > Math.floor(Date.now() / 1000)) {
    return session.access_token;
  }
  // Refresh.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    await clearSession();
    return null;
  }
  const refreshed = await persist(await res.json());
  return refreshed.access_token;
}

export async function loadSession(): Promise<AuthSession | null> {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return (out[STORAGE_KEY] as AuthSession) ?? null;
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * Persist a session forwarded from queer.guide (web bridge or AuthCallback).
 * Tokens are stored as-is; the Supabase user id is decoded out of the JWT
 * `sub` claim so the popup can show "Signed in as <email>" without an extra
 * /auth/v1/user round-trip.
 */
export async function persistSharedSession(input: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}): Promise<AuthSession> {
  const claims = decodeJwtClaims(input.access_token);
  const session: AuthSession = {
    access_token: input.access_token,
    refresh_token: input.refresh_token,
    expires_at:
      typeof claims.exp === "number"
        ? claims.exp
        : Math.floor(Date.now() / 1000) + (input.expires_in ?? 3600),
    user: {
      id: input.user?.id ?? (typeof claims.sub === "string" ? claims.sub : ""),
      email:
        input.user?.email ??
        (typeof claims.email === "string" ? claims.email : undefined),
    },
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  return session;
}

function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function persist(raw: unknown): Promise<AuthSession> {
  const r = raw as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email?: string };
  };
  const session: AuthSession = {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + r.expires_in,
    user: { id: r.user.id, email: r.user.email },
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  return session;
}
