/** Shared read-only vocabulary snapshots. No browser or framework dependencies. */
export interface ReferenceTerm {
  id: string;
  value: string;
  name: string;
  metadata: Record<string, unknown>;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}
const snapshots = new Map<string, ReferenceTerm[]>();
const signatures = new Map<string, string>();
const listeners = new Set<(taxonomy: string, terms: ReferenceTerm[]) => void>();
let revision = 0;
export const referenceTaxonomyRevision = () => revision;
export const referenceTaxonomyRows = (taxonomy: string) => snapshots.get(taxonomy);
export function observeReferenceTaxonomies(
  listener: (taxonomy: string, terms: ReferenceTerm[]) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function replaceReferenceTaxonomy(taxonomy: string, terms: ReferenceTerm[]) {
  const signature = JSON.stringify(terms);
  if (signatures.get(taxonomy) === signature) return;
  signatures.set(taxonomy, signature);
  snapshots.set(taxonomy, terms);
  revision += 1;
  for (const listener of listeners) listener(taxonomy, terms);
}
