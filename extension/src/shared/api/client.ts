/**
 * Shared HTTP/env primitives for every api/* module. Keeping this in one
 * place avoids re-reading import.meta.env in every feature file and gives
 * the rest of the API layer a single point to mock in tests.
 */

export const API = import.meta.env.VITE_SUBMIT_API as string;
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function authHeaders(accessToken: string, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export function pgrstHeaders(accessToken?: string): HeadersInit {
  const h: Record<string, string> = { apikey: ANON_KEY };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  return h;
}

export function jwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

export async function ensureOk(res: Response, label: string): Promise<Response> {
  if (!res.ok) throw new Error(`${label} ${res.status}: ${await res.text()}`);
  return res;
}
