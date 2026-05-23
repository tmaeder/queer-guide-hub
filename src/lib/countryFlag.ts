// Convert a 2-letter ISO country code to its flag emoji using regional indicator
// symbols. Returns null for missing / malformed input. countries.flag_emoji
// in the DB is currently unpopulated; this avoids needing a backfill.
export function codeToFlagEmoji(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  const base = 0x1f1e6;
  const a = upper.charCodeAt(0) - 65;
  const b = upper.charCodeAt(1) - 65;
  return String.fromCodePoint(base + a, base + b);
}
