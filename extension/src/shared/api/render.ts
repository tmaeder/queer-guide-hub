import type { DetectedItem } from "../types";
import { API, authHeaders, ensureOk } from "./client";

export async function renderUrl(url: string, accessToken: string): Promise<DetectedItem[]> {
  const res = await fetch(`${API}/render`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ url }),
  });
  await ensureOk(res, "render");
  const body = (await res.json()) as { items: DetectedItem[] };
  return body.items;
}

export interface SitemapEntry { loc: string; lastmod?: string; }

export async function scanSitemap(url: string, accessToken: string): Promise<SitemapEntry[]> {
  const res = await fetch(`${API}/scan-sitemap`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ url }),
  });
  await ensureOk(res, "scan-sitemap");
  const body = (await res.json()) as { entries: SitemapEntry[] };
  return body.entries;
}
