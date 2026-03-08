/**
 * Local avatar generation — replaces Gravatar to keep user email hashes private.
 * Generates deterministic initials-based SVG avatars as data URIs.
 */

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
];

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
