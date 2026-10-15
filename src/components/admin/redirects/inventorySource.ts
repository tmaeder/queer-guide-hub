import type { InventoryRedirect } from '@/lib/redirects/inventory';

/**
 * Absolute https URL for a redirect row, or null when the row has no single
 * concrete source to copy or encode as a QR (wildcard, path parameter, or a
 * non-EXACT manual match that stands for a family of URLs rather than one).
 *
 * Lives outside RedirectOtherInventory.tsx so that module only exports
 * components: a non-component export there breaks react-refresh HMR for the
 * whole file (react-refresh/only-export-components).
 */
export function concreteInventorySource(
  row: InventoryRedirect & { matchKind?: string },
): string | null {
  if (row.kind === 'Manual' && !row.isShortLink && row.matchKind && row.matchKind !== 'EXACT')
    return null;
  if (
    (!row.source.startsWith('/') && !/^https?:\/\//i.test(row.source)) ||
    /(^|\/):[a-z_]/i.test(row.source) ||
    row.source.includes('*')
  )
    return null;
  try {
    const url = new URL(row.source, 'https://queer.guide');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
