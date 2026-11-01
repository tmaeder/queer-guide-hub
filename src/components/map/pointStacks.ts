/**
 * Places that share one exact coordinate, collapsed into ONE map feature.
 *
 * From zoom 13 up the map no longer clusters (see CLUSTER_MAX_ZOOM), so a
 * stack of places on one spot would draw as N identical pins on top of each
 * other with only the top one clickable. Instead the stack is one feature: the
 * highest-priority place carries `stack_count` and represents the rest, which
 * are kept aside and handed to the fan-out ring or the results list on click.
 *
 * Pure and deterministic so it can be unit-tested and re-run on every data
 * change without the representative jumping around.
 */

/** Decimal places compared: 1e-5 deg is ~1 m, the same bar as clusterClick. */
const KEY_DP = 5;

export interface StackableFeature {
  geometry: { coordinates: number[] };
  properties: { id: string; featured?: boolean; live?: boolean } & Record<string, unknown>;
}

export interface CollapsedStacks<F extends StackableFeature> {
  /** One feature per spot; a stack's representative carries `stack_count`. */
  features: F[];
  /** Representative id → every place at that spot, representative first. */
  members: Map<string, F[]>;
}

const keyOf = (f: StackableFeature) =>
  `${Number(f.geometry.coordinates[0]).toFixed(KEY_DP)},${Number(f.geometry.coordinates[1]).toFixed(KEY_DP)}`;

/** Featured first, then live, then a stable id order. */
export function compareStackPriority(a: StackableFeature, b: StackableFeature): number {
  const fa = a.properties.featured ? 1 : 0;
  const fb = b.properties.featured ? 1 : 0;
  if (fa !== fb) return fb - fa;
  const la = a.properties.live ? 1 : 0;
  const lb = b.properties.live ? 1 : 0;
  if (la !== lb) return lb - la;
  return a.properties.id < b.properties.id ? -1 : a.properties.id > b.properties.id ? 1 : 0;
}

export function collapseColocated<F extends StackableFeature>(input: F[]): CollapsedStacks<F> {
  const groups = new Map<string, F[]>();
  for (const f of input) {
    const k = keyOf(f);
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }
  const features: F[] = [];
  const members = new Map<string, F[]>();
  for (const group of groups.values()) {
    const sorted = group.length > 1 ? [...group].sort(compareStackPriority) : group;
    const rep = sorted[0];
    features.push({
      ...rep,
      properties: { ...rep.properties, stack_count: sorted.length },
    });
    if (sorted.length > 1) members.set(rep.properties.id, sorted);
  }
  return { features, members };
}
