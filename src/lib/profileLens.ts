/** Viewer lenses for the profile. 'you' = owner view; the others preview/enforce visibility. */
export type ProfileLens = 'you' | 'community' | 'public';

/**
 * Whether a profile section is visible under a lens, given its visibility
 * setting ('public' | 'community' | 'private'; legacy 'friends' ≡ 'community').
 */
export function sectionVisible(
  setting: string | undefined,
  lens: ProfileLens,
  fallback: 'public' | 'community' | 'private',
): boolean {
  const v = setting === 'friends' ? 'community' : (setting ?? fallback);
  if (lens === 'you') return true;
  if (v === 'public') return true;
  if (v === 'community') return lens === 'community';
  return false;
}
