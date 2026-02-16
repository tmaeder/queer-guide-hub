/**
 * Redirect validation utilities.
 * Shared between frontend admin UI and tests.
 */

// ── Slug validation ─────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_MIN = 3;
const SLUG_MAX = 64;

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'go', 'auth', 'login', 'signup', 'sitemap', 'robots',
  'favicon', 'manifest', 'sw', 'index', 'health', 'status', 'null', 'undefined',
  'test', 'www', 'mail', 'ftp', 'cdn', 'assets', 'static', 'public',
]);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateSlug(slug: string): ValidationResult {
  if (!slug) return { valid: false, error: 'Slug is required' };

  const s = slug.trim();

  if (s.length < SLUG_MIN) {
    return { valid: false, error: `Slug must be at least ${SLUG_MIN} characters` };
  }
  if (s.length > SLUG_MAX) {
    return { valid: false, error: `Slug must be at most ${SLUG_MAX} characters` };
  }
  if (!SLUG_REGEX.test(s)) {
    return {
      valid: false,
      error: 'Slug must contain only lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)',
    };
  }
  if (RESERVED_SLUGS.has(s)) {
    return { valid: false, error: `"${s}" is a reserved word and cannot be used as a slug` };
  }

  return { valid: true };
}

// ── Target validation ───────────────────────────────────────────────────────

/** Domains allowed for external redirects. Add more as needed. */
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'queer.guide',
  'www.queer.guide',
  'queer-guide.pages.dev',
]);

const DANGEROUS_PROTOCOLS = new Set([
  'javascript:', 'data:', 'vbscript:', 'blob:', 'file:',
]);

export function validateTarget(target: string): ValidationResult {
  if (!target || !target.trim()) {
    return { valid: false, error: 'Target URL is required' };
  }

  const t = target.trim();

  // Block dangerous protocols
  const lowerTarget = t.toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (lowerTarget.startsWith(proto)) {
      return { valid: false, error: `Protocol "${proto}" is not allowed` };
    }
  }

  // Relative paths are always allowed
  if (t.startsWith('/')) {
    // Block path traversal
    if (t.includes('..') || t.includes('//')) {
      return { valid: false, error: 'Target path contains invalid sequences' };
    }
    return { valid: true };
  }

  // Absolute URLs must match allowlist
  try {
    const url = new URL(t);

    if (!ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
      return {
        valid: false,
        error: `External host "${url.hostname}" is not in the allowlist. Only relative paths or allowlisted domains are permitted.`,
      };
    }

    if (DANGEROUS_PROTOCOLS.has(url.protocol)) {
      return { valid: false, error: `Protocol "${url.protocol}" is not allowed` };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Target must be a valid relative path (starting with /) or absolute URL' };
  }
}

// ── Query parameter merging ─────────────────────────────────────────────────

export type QueryMode = 'PRESERVE' | 'DROP' | 'OVERRIDE';

export interface QueryMergeOptions {
  mode: QueryMode;
  /** Incoming query string from the request (e.g. "utm_source=qr&ref=twitter") */
  incomingQuery?: string;
  /** Key/value overrides from the redirect config */
  overrides?: Record<string, string>;
  /** Default UTM params to add if not already present */
  utmDefaults?: Record<string, string>;
}

export function mergeQueryParams(targetUrl: string, options: QueryMergeOptions): string {
  const { mode, incomingQuery, overrides, utmDefaults } = options;

  // Parse target URL to extract its existing query params
  let basePath: string;
  let targetParams: URLSearchParams;

  if (targetUrl.startsWith('http')) {
    const url = new URL(targetUrl);
    basePath = url.origin + url.pathname;
    targetParams = url.searchParams;
  } else {
    const qIdx = targetUrl.indexOf('?');
    if (qIdx >= 0) {
      basePath = targetUrl.substring(0, qIdx);
      targetParams = new URLSearchParams(targetUrl.substring(qIdx + 1));
    } else {
      basePath = targetUrl;
      targetParams = new URLSearchParams();
    }
  }

  if (mode === 'DROP') {
    // Only keep target's own params
    const qs = targetParams.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const merged = new URLSearchParams(targetParams);

  // PRESERVE: add incoming params (don't overwrite target's own)
  if (mode === 'PRESERVE' && incomingQuery) {
    const incoming = new URLSearchParams(incomingQuery);
    for (const [key, value] of incoming) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    }
  }

  // OVERRIDE: apply explicit overrides
  if (mode === 'OVERRIDE' && overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      merged.set(key, value);
    }
    // Also preserve incoming params that aren't being overridden
    if (incomingQuery) {
      const incoming = new URLSearchParams(incomingQuery);
      for (const [key, value] of incoming) {
        if (!merged.has(key)) {
          merged.set(key, value);
        }
      }
    }
  }

  // Apply UTM defaults (only add if key not already present)
  if (utmDefaults) {
    for (const [key, value] of Object.entries(utmDefaults)) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    }
  }

  const qs = merged.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// ── Loop detection ──────────────────────────────────────────────────────────

/**
 * Detect if a redirect target would create a loop.
 * Returns true if the redirect is safe (no loop detected).
 */
export function detectLoop(
  requestPath: string,
  targetUrl: string,
  maxHops: number = 3,
): { safe: boolean; error?: string } {
  // Normalize both to compare
  const normalizeForCompare = (url: string): string => {
    if (url.startsWith('http')) {
      try {
        const u = new URL(url);
        // Only compare path for same-origin URLs
        if (ALLOWED_EXTERNAL_HOSTS.has(u.hostname)) {
          return u.pathname;
        }
        return url;
      } catch {
        return url;
      }
    }
    // Strip query and hash for comparison
    return url.split('?')[0].split('#')[0];
  };

  const source = normalizeForCompare(requestPath);
  const dest = normalizeForCompare(targetUrl);

  if (source === dest) {
    return { safe: false, error: 'Redirect target is the same as the source (direct loop)' };
  }

  // For /go/ short links, check if target points back to /go/
  if (dest.startsWith('/go/')) {
    return { safe: false, error: 'Target points to another short link, which could create a chain' };
  }

  return { safe: true };
}

// ── Source path validation (for PATH type) ──────────────────────────────────

export function validateSourcePath(path: string): ValidationResult {
  if (!path || !path.trim()) {
    return { valid: false, error: 'Source path is required' };
  }
  const p = path.trim();
  if (!p.startsWith('/')) {
    return { valid: false, error: 'Source path must start with /' };
  }
  if (p.includes('..')) {
    return { valid: false, error: 'Source path cannot contain ".."' };
  }
  return { valid: true };
}
