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
 * Owner "view as" preview: strips the own full profile down to what
 * get_public_profile_safe would return to that audience. Mirrors the RPC's
 * rules — keep the two in sync (supabase/migrations/*profile_visibility*).
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
  if (ps.location_public === true) out.location = profile.location;
  if (ps.pronouns_public === true) out.pronouns = profile.pronouns;
  if (ps.contact_public === true) {
    out.website = profile.website;
    out.social_links = profile.social_links;
  }
  if (ps.interests_public === true) {
    out.interests = profile.interests;
    out.occupation = profile.occupation;
    out.education = profile.education;
  }
  const identityVis = (ps.identity_visibility as string) ?? 'friends';
  if (identityVis === 'public' || (identityVis === 'community' && lens === 'community')) {
    out.gender_identity = profile.gender_identity;
    out.sexual_orientation = profile.sexual_orientation;
  }
  const relVis = (ps.relationships_visibility as string) ?? 'friends';
  if (relVis === 'public' || (relVis === 'community' && lens === 'community')) {
    out.current_relationship_status = profile.current_relationship_status;
  }
  return out;
}
