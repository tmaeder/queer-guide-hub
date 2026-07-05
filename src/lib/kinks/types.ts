// Shared types for the kink/interest checklist.

export type KinkAxis = 'general' | 'give_receive' | 'self_partner' | 'dom_sub';

export type KinkSide =
  | 'general'
  | 'giving'
  | 'receiving'
  | 'self'
  | 'partner'
  | 'dominant'
  | 'submissive';

export type KinkRatingValue = 'favorite' | 'like' | 'curious' | 'maybe' | 'no' | 'hard_limit';

export type KinkTier = 'private' | 'unlocked' | 'matches' | 'members';

export interface KinkCategory {
  id: string;
  slug: string;
  label: string;
  label_i18n: Record<string, string>;
  description: string | null;
  description_i18n: Record<string, string>;
  axis: KinkAxis;
  sort_order: number;
}

export interface KinkItem {
  id: string;
  category_id: string;
  slug: string;
  label: string;
  label_i18n: Record<string, string>;
  description: string | null;
  description_i18n: Record<string, string>;
  axis_override: KinkAxis | null;
  discussion_recommended: boolean;
  sort_order: number;
}

export interface KinkRating {
  user_id: string;
  item_id: string;
  side: KinkSide;
  rating: KinkRatingValue;
  needs_discussion: boolean;
}

export interface KinkCategoryVisibility {
  category_id: string;
  tier: KinkTier;
  include_in_share: boolean;
}

export interface KinkGrant {
  id: string;
  grantor_id: string;
  grantee_id: string;
  kind: 'view' | 'compare';
  conversation_id: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface KinkVisibleRow {
  category_slug: string;
  item_slug: string;
  side: KinkSide;
  rating: Exclude<KinkRatingValue, 'no' | 'hard_limit'>;
  needs_discussion: boolean;
}

export interface KinkCompareRow {
  category_slug: string;
  item_slug: string;
  my_side: KinkSide;
  my_rating: string;
  their_side: KinkSide;
  their_rating: string;
  kind: 'overlap' | 'discuss';
}

export type KinkCompareStatus = 'none' | 'requested_by_me' | 'requested_by_other' | 'active';

export interface KinkCompareSummary {
  overlaps: number;
  favorites_both: number;
  discuss: number;
  excluded_count: number;
}

export interface KinkShareLink {
  id: string;
  code: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  created_at: string;
}

/** Sides a rating can take for a given axis. */
export const AXIS_SIDES: Record<KinkAxis, KinkSide[]> = {
  general: ['general'],
  give_receive: ['giving', 'receiving'],
  self_partner: ['self', 'partner'],
  dom_sub: ['dominant', 'submissive'],
};

/** Positive ratings (everything shown to others; no/hard_limit stay private). */
export const POSITIVE_RATINGS: KinkRatingValue[] = ['favorite', 'like', 'curious', 'maybe'];

export function itemAxis(item: KinkItem, category: KinkCategory): KinkAxis {
  return item.axis_override ?? category.axis;
}

/** Localized label with English fallback. */
export function kinkLabel(
  entity: { label: string; label_i18n: Record<string, string> },
  lang: string,
): string {
  return entity.label_i18n?.[lang] ?? entity.label;
}
