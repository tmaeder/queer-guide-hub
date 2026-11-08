/**
 * Shared HTTP/env primitives for every api/* module. Keeping this in one
 * place avoids re-reading import.meta.env in every feature file and gives
 * the rest of the API layer a single point to mock in tests.
 */

export const API = import.meta.env.VITE_SUBMIT_API as string;

export function authHeaders(accessToken: string, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function ensureOk(res: Response, label: string): Promise<Response> {
  if (!res.ok) throw new Error(`${label} ${res.status}: ${await res.text()}`);
  return res;
}
