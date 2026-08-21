/**
 * Sanitize a post-auth redirect target taken from a URL param or router state.
 *
 * Returns the path if it is a safe same-origin path, otherwise null.
 *
 * The value reaches us from `?redirect=`, which anyone can put in a link they
 * send to someone else. React Router treats an absolute URL as a relative path
 * so today's exposure is small, but the moment any caller passes it to
 * `window.location` instead it becomes an open redirect — a phishing primitive
 * worth rather more on a queer platform than on most.
 *
 * Rejects:
 *   - anything not starting with a single "/" (absolute URLs, bare hosts)
 *   - "//evil.com" — protocol-relative, which browsers treat as cross-origin
 *   - "/\evil.com" — backslash, which some parsers normalise to "//"
 *   - any embedded scheme
 *   - control characters, which can split the value in some sinks
 */
export function sanitizeRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();

  if (!value.startsWith('/')) return null;
  // Protocol-relative or backslash-smuggled host.
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/^\/+[\\/]/.test(value)) return null;
  // A scheme anywhere means it is not a plain path.
  if (/[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  // Codepoint check rather than a regex: the control range is awkward to write
  // as an escape without tooling mangling it, and this is unambiguous.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }

  return value;
}
