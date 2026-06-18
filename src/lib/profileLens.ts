/** Viewer lenses for the profile. 'you' = owner view; the others preview/enforce visibility. */
export type ProfileLens = 'you' | 'community' | 'public';

/**
 * Whether a profile section is visible under a lens, given its visibility
 * setting ('public' | 'community' | 'friends' | 'private'). 'friends' cannot
 * be simulated in preview (friendship is server-evaluated), so it only shows
 * under the owner lens.
 */
export function sectionVisible(
  setting: string | undefined,
  lens: ProfileLens,
  fallback: 'public' | 'community' | 'friends' | 'private',
): boolean {
  const v = setting ?? fallback;
  if (lens === 'you') return true;
  if (v === 'public') return true;
  if (v === 'community') return lens === 'community';
  return false; // 'friends' and 'private' never show in preview lenses
}

/**
 * Resolve a field's effective visibility tier from privacy_settings.
 * String *_visibility key is the source of truth; legacy *_public boolean is the
 * non-regressive fallback. Mirrors SQL resolve_profile_field_visibility().
 */
function resolveFieldVis(
  ps: Record<string, unknown>,
  stringKey: string,
  boolKey: string,
  fallback: string,
): string {
  const s = ps[stringKey];
  if (typeof s === 'string' && s) return s;
  const b = ps[boolKey];
  if (typeof b === 'boolean') return b ? 'public' : 'private';
  return fallback;
}

/** Whether a tier shows under a preview lens. 'friends' is server-only (never previews). */
function tierVisible(tier: string, lens: ProfileLens): boolean {
  if (tier === 'public') return true;
  if (tier === 'community') return lens === 'community';
  return false;
}

/**
 * Owner "view as" preview: strips the own full profile down to what
 * get_public_profile_safe would return to that audience. Mirrors the RPC's
 * rules — keep the two in sync
 * (supabase/migrations/20260618100000_profile_field_visibility_reconcile.sql).
 */
export function previewFilterProfile(
  profile: Record<string, unknown>,
  lens: ProfileLens,
): Record<string, unknown> {
  if (lens === 'you') return profile;
  const ps = (profile.privacy_settings ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    id: profile.id,
    user_id: profile.user_id,
    display_name: profile.display_name,
    username: profile.username,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    created_at: profile.created_at,
    is_business: profile.is_business,
    user_mode: profile.user_mode,
    privacy_settings: ps,
  };
  if (tierVisible(resolveFieldVis(ps, 'location_visibility', 'location_public', 'public'), lens)) {
    out.location = profile.location;
  }
  if (tierVisible(resolveFieldVis(ps, 'pronouns_visibility', 'pronouns_public', 'public'), lens)) {
    out.pronouns = profile.pronouns;
  }
  if (tierVisible(resolveFieldVis(ps, 'contact_visibility', 'contact_public', 'friends'), lens)) {
    out.website = profile.website;
    out.social_links = profile.social_links;
  }
  if (tierVisible(resolveFieldVis(ps, 'interests_visibility', 'interests_public', 'community'), lens)) {
    out.interests = profile.interests;
    out.occupation = profile.occupation;
    out.education = profile.education;
  }
  if (tierVisible((ps.identity_visibility as string) ?? 'friends', lens)) {
    out.gender_identity = profile.gender_identity;
    out.sexual_orientation = profile.sexual_orientation;
  }
  if (tierVisible((ps.relationships_visibility as string) ?? 'friends', lens)) {
    out.current_relationship_status = profile.current_relationship_status;
  }
  return out;
}
