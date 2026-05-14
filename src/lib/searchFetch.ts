/**
 * Shared fetch wrapper for the search-proxy worker. Distinguishes failure
 * modes so the UI can render an honest error message and Sentry can tag the
 * actual cause:
 *
 *   csp_or_dns_blocked  TypeError thrown synchronously, no network entry.
 *                       The browser blocked the request before it left
 *                       (CSP violation, DNS failure, mixed content). Not
 *                       transient — do NOT retry.
 *   timeout             AbortError after the per-call deadline. Worth a
 *                       single retry for a slow upstream blip.
 *   upstream_error      5xx response from the worker.
 *   client_error        4xx response. The body's {error,code,field} comes
 *                       through so callers can show specific messages.
 *   ok                  2xx, parsed JSON.
 *
 * Bug #2 in the search bug report: the previous wrapper retried 3× on every
 * failure and surfaced everything as a generic "Couldn't reach search",
 * which masked the prod-down CSP misconfiguration for hours.
 */

import * as Sentry from '@sentry/react';

const SEARCH_PROXY_URL =
  import.meta.env.VITE_SEARCH_PROXY_URL || 'https://search.queer.guide';

export const SEARCH_UNAVAILABLE_MESSAGE =
  "Search is temporarily unavailable. We've been notified.";

export type SearchFetchError =
  | { kind: 'csp_or_dns_blocked'; message: string; cause: unknown }
  | { kind: 'timeout'; message: string }
  | { kind: 'upstream_error'; status: number; body: string }
  | { kind: 'client_error'; status: number; code: string; error: string; field?: string };

export class SearchFetchException extends Error {
  constructor(public readonly detail: SearchFetchError) {
    super(detail.kind === 'client_error' ? detail.error : detail.message ?? `search ${detail.kind}`);
    this.name = 'SearchFetchException';
  }
}

interface FetchOpts {
  /** Per-call timeout. Default 10s for /search, 5s for /autocomplete. */
  timeoutMs?: number;
  /** Retry once on timeout? Default true. CSP errors never retry. */
  retryOnTimeout?: boolean;
  signal?: AbortSignal;
}

export async function searchFetch<T>(
  path: string,
  body: unknown,
  opts: FetchOpts = {},
): Promise<T> {
  const { timeoutMs = 10_000, retryOnTimeout = true, signal: externalSignal } = opts;
  const url = path.startsWith('http') ? path : `${SEARCH_PROXY_URL}${path}`;

  const attempt = async (): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        keepalive: true,
      });
    } catch (err) {
      clearTimeout(timeout);
      // AbortError → timeout. Everything else thrown synchronously by fetch is
      // treated as a network/CSP block. The browser swallows the real reason
      // for the latter so we cannot distinguish CSP from offline from DNS
      // here — we tag accordingly and surface the same user message.
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new SearchFetchException({ kind: 'timeout', message: 'search timed out' });
      }
      throw new SearchFetchException({
        kind: 'csp_or_dns_blocked',
        message: 'browser blocked the search request',
        cause: err,
      });
    }
    clearTimeout(timeout);

    if (res.ok) return (await res.json()) as T;

    if (res.status >= 500) {
      const text = await res.text().catch(() => '');
      throw new SearchFetchException({ kind: 'upstream_error', status: res.status, body: text });
    }

    // 4xx — try to surface the structured error.
    let parsed: { error?: string; code?: string; field?: string } = {};
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON 4xx body */
    }
    throw new SearchFetchException({
      kind: 'client_error',
      status: res.status,
      code: parsed.code ?? `http_${res.status}`,
      error: parsed.error ?? `Search failed (${res.status})`,
      field: parsed.field,
    });
  };

  try {
    return await attempt();
  } catch (err) {
    const detail = (err as SearchFetchException).detail;
    if (detail?.kind === 'timeout' && retryOnTimeout) {
      // One retry. CSP / 4xx / 5xx never retry — they aren't transient.
      try {
        return await attempt();
      } catch (err2) {
        reportToSentry(path, (err2 as SearchFetchException).detail);
        throw err2;
      }
    }
    reportToSentry(path, detail);
    throw err;
  }
}

function reportToSentry(path: string, detail: SearchFetchError | undefined) {
  if (!detail) return;
  const tag =
    detail.kind === 'csp_or_dns_blocked'
      ? 'search.csp_or_dns_blocked'
      : detail.kind === 'timeout'
        ? 'search.timeout'
        : detail.kind === 'upstream_error'
          ? 'search.upstream_error'
          : `search.client_error.${detail.code}`;
  try {
    Sentry.withScope((scope) => {
      scope.setTag('search.failure_kind', tag);
      scope.setTag('search.path', path);
      if (detail.kind === 'upstream_error') scope.setExtra('upstream_status', detail.status);
      if (detail.kind === 'client_error') {
        scope.setExtra('client_status', detail.status);
        if (detail.field) scope.setExtra('field', detail.field);
      }
      Sentry.captureMessage(`search-proxy ${tag}`, 'error');
    });
  } catch {
    /* sentry init may not have run */
  }
}

/** True for the failure modes that warrant the "search unavailable" UI. */
export function isSearchUnavailable(err: unknown): boolean {
  if (!(err instanceof SearchFetchException)) return false;
  const k = err.detail.kind;
  return k === 'csp_or_dns_blocked' || k === 'upstream_error' || (k === 'timeout');
}
