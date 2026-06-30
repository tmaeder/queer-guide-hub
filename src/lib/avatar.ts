/**
 * Local avatar generation — replaces Gravatar to keep user email hashes private.
 * Generates deterministic initials-based SVG avatars as data URIs.
 */

// Monochrome dark-gray steps — deterministic variety without hue (the former
// rainbow palette was removed in the monochrome strip). All steps stay dark
// enough for the white initials to keep AA contrast. Concrete hex is required
// here because the value is inlined into a standalone SVG data-URI, where CSS
// custom properties (hsl(var(--…))) don't resolve — same constraint as
// Footprint.tsx; this file stays on the ESLint color allowlist.
const COLORS = ['#0a0a0a', '#1f1f1f', '#2e2e2e', '#404040', '#525252'];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

/**
 * Generate a deterministic avatar SVG data URI from a name or email.
 * Color is stable for the same input string.
 */
export function generateAvatarUrl(
  nameOrEmail: string | null | undefined,
  size = 200,
): string | null {
  if (!nameOrEmail) return null;

  const input = nameOrEmail.trim().toLowerCase();
  const color = COLORS[hashCode(input) % COLORS.length];
  const initials = getInitials(nameOrEmail);
  const fontSize = size * 0.4;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${color}"/>
    <text x="50%" y="50%" dy=".1em" fill="white" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="central">${initials}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
