const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailLike(value: string | null | undefined): boolean {
  return !!value && EMAIL_RE.test(value.trim());
}

/**
 * Display name safe for rendering. Email addresses are never shown as a name —
 * older signups had display_name seeded from the account email, which links a
 * profile to a legal identity. Returns '' so callers fall back to their own
 * placeholder ("Add your name", "Anonymous User", …).
 */
export function publicDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return isEmailLike(trimmed) ? '' : trimmed;
}
