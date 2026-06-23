// Profile gap detection + dismissal — shared by the Overview gap prompt and the
// completion nudge so they stay mutually exclusive (one completion surface only).

const PROMPT_DISMISS_KEY = 'qg.settings.prompt.dismissed';
const PROMPT_REDISPLAY_MS = 7 * 24 * 60 * 60 * 1000;

export function promptDismissed(kind: string): boolean {
  try {
    const raw = localStorage.getItem(`${PROMPT_DISMISS_KEY}.${kind}`);
    return !!raw && Date.now() - Number(raw) < PROMPT_REDISPLAY_MS;
  } catch {
    return false;
  }
}

export function dismissPrompt(kind: string): void {
  try {
    localStorage.setItem(`${PROMPT_DISMISS_KEY}.${kind}`, String(Date.now()));
  } catch {
    /* storage unavailable — prompt just stays */
  }
}

export interface ProfileGap {
  kind: string;
  title: string;
  body: string;
  cta: string;
  section: string;
}

/**
 * The single highest-priority profile gap (username > avatar > pronouns), or
 * null when there's nothing to nudge.
 */
export function getProfileGap(profile: Record<string, unknown>): ProfileGap | null {
  const username = (profile.username as string | null) ?? null;
  const pronounTags = (profile.pronoun_tags as string[] | null) ?? [];

  if (!username) {
    return {
      kind: 'username',
      title: 'Claim your @username',
      body: 'Your permanent handle for mentions and your profile link.',
      cta: 'Claim now',
      section: 'account',
    };
  }
  if (profile.avatar_auto_assigned && !promptDismissed('avatar')) {
    return {
      kind: 'avatar',
      title: 'Make your avatar yours',
      body: 'We gave you a starter look. Upload a photo, import one, or build your own.',
      cta: 'Choose avatar',
      section: 'avatar',
    };
  }
  if (pronounTags.length === 0 && !promptDismissed('pronouns')) {
    return {
      kind: 'pronouns',
      title: 'Add your pronouns',
      body: 'Optional, takes 30 seconds. You decide who sees them.',
      cta: 'Add pronouns',
      section: 'profile',
    };
  }
  return null;
}
