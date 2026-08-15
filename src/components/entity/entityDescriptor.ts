import type { ReactNode } from 'react';
import type { BreadcrumbItem } from '@/contexts/BreadcrumbContext';

/**
 * Shared contract for the unified entity detail page. A per-source *adapter*
 * hook (venue / organisation) turns raw data into an `EntityDescriptor`; the
 * `EntityDetailScroll` shell renders it as a single vertical scroll without
 * knowing which kind of entity it is. Everything venue-vs-org specific lives in
 * the adapter — the shell is a dumb iterator over `sections`.
 */

export type EntitySource = 'venue' | 'organization' | 'milestone';

/** Meta payload handed to `useMeta` (mirrors its internal MetaOptions). */
export interface EntityMeta {
  title?: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  canonicalPath?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noIndex?: boolean;
}

/** Inputs to `useTrackView` — kept verbatim from the legacy pages. */
export interface EntityTrackView {
  type: string;
  slug?: string;
  title?: string;
  image?: string;
  city?: string;
  country?: string;
}

/**
 * One block in the single scroll. `when === false` removes it so the narrative
 * never shows an empty section. `render` is a thunk so hidden sections cost
 * nothing and adapters can reuse existing components verbatim.
 */
export interface EntitySection {
  id: string;
  /** Heading for the subway single. `EntityDetailScroll` ignores it — that
   *  shell lets each section render its own heading. */
  title?: string;
  when?: boolean;
  render: () => ReactNode;
}

/** Raw signals the personalisation band reads (it computes its own copy). */
export interface EntityPersonalization {
  entityType: EntitySource;
  entityId: string;
  /** Entity's own tags — intersected with the user's interests. */
  tags: string[];
  lat: number | null;
  lng: number | null;
  countryId: string | null;
  countryName: string | null;
  /** Country `lgbti_criminalization` jsonb — drives identity-aware framing. */
  criminalization: Record<string, unknown> | null;
}

/** Source for the single related-content rail (one `SimilarItems`). */
export interface EntityRelatedSource {
  type: EntitySource;
  id: string;
  title: string;
}

/**
 * Masthead + rail shape for a type that has moved to the subway `SinglePage`.
 *
 * Additive and optional on purpose: `EntityDetailView` picks `EntitySingle`
 * when a descriptor carries this and `EntityDetailScroll` when it does not, so
 * venue could move without dragging organisations and milestones with it.
 * When those two follow, the old shell and this flag both go.
 */
export interface EntitySingleShape {
  /** Uppercase line above the title, e.g. "Venue · Berlin". */
  eyebrow?: string;
  /** Bordered ink chip — a STATE ("Open now", "Permanently closed"). */
  status?: string;
  lead?: ReactNode;
  /** S4 tag array + any standfirst that carries links (the `lead` slot is a `<p>`). */
  tags?: ReactNode;
  /** S5 — one concrete verb, plus report/admin. */
  action?: ReactNode;
  /** Rendered at the TOP of the body, above the route rail and the sections —
   *  the cover photo and any banner that must precede everything. */
  bodyLead?: ReactNode;
  /** Rail-slot modules, top to bottom. The rail reflows UNDER the body on mobile. */
  rail?: ReactNode;
  /** Which line the route rail draws in. */
  track?: 'pink' | 'blue' | 'green' | 'yellow';
}

export interface EntityDescriptor {
  source: EntitySource;
  id: string;
  slug: string;
  title: string;
  hero: ReactNode;
  /** Ordered single-scroll body. */
  sections: EntitySection[];
  /** Right column on desktop; null collapses the grid to one column. */
  sidebar: ReactNode | null;
  /** Bottom rail. Null skips it. */
  related: EntityRelatedSource | null;
  /** Sticky mobile action bar node, or null (e.g. closed venue). */
  mobileBar: ReactNode | null;
  /** Dialogs / portals (e.g. add-to-trip) the adapter owns. */
  overlays: ReactNode | null;
  breadcrumbs: BreadcrumbItem[];
  meta: EntityMeta;
  /** Null when the entity has nothing to personalise on. */
  personalization: EntityPersonalization | null;
  trackView: EntityTrackView;
  /** Present = render on `SinglePage`; absent = the legacy scroll shell. */
  single?: EntitySingleShape;
}

/** Result returned by every adapter hook. */
export interface EntityDescriptorResult {
  descriptor: EntityDescriptor | null;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
  refetch: () => void;
}
