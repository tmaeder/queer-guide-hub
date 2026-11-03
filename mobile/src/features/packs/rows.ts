import type { PackIndexEntry } from './format';
import type { InstalledPack } from './store';

/** Failures that mean the file was wrong, not that the network was. */
export const SECURITY_CODES = new Set(['bad_signature', 'digest_mismatch', 'id_mismatch', 'rollback', 'bad_format']);

export interface PackRow {
  id: string;
  name: string;
  available?: PackIndexEntry;
  installed?: InstalledPack;
}

/** Index entries and installed packs, merged; installed-only packs stay removable. */
export function mergeRows(available: PackIndexEntry[], installed: InstalledPack[]): PackRow[] {
  const rows = new Map<string, PackRow>();
  for (const a of available) rows.set(a.id, { id: a.id, name: a.name, available: a });
  for (const i of installed) rows.set(i.id, { ...rows.get(i.id), id: i.id, name: i.name, installed: i });
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
