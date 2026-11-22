import { useTranslation } from 'react-i18next';
import { Check, Coffee, Globe, Heart, LogIn, Mountain, Music, Palette } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useFollowedTags } from '@/hooks/useFollowedTags';
import { useInterestVocabularyTags, type InterestTag } from '@/hooks/useInterestVocabularyTags';
import { INTEREST_GROUPS } from '@/config/interestVocabulary';
import { cn } from '@/lib/utils';

/**
 * Declare a few interests, in one place.
 *
 * The matching this feeds was already fully built — interestMatch.ts,
 * people_discovery's shared-interest signals, follow_tag/unfollow_tag,
 * useFollowedTags — and had zero input: `tag_follows` held 0 rows against 9,170
 * tags, and 1 of 17 profiles had any interests. The reason was reachability,
 * not disinterest: the only way to follow a tag was to land on that single
 * tag's detail page and click follow, one tag at a time.
 *
 * So this is not a new feature so much as the missing front door to one.
 *
 * Vocabulary and its safety rule live in config/interestVocabulary — activities
 * only, never identity, because a match here is shown to another user.
 */
/** Enough to find common ground; more turns the signal into noise. */
export const MAX_INTERESTS = 8;

const GROUP_ICONS: Record<string, typeof Music> = {
  'Going out': Music,
  Quieter: Coffee,
  Culture: Palette,
  Active: Mountain,
  'Out in the world': Globe,
};

export function InterestPicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { isFollowing, toggleFollow, signedIn } = useFollowedTags();

  const { data: tags = [] } = useInterestVocabularyTags();

  const bySlug = new Map(tags.map((tg) => [tg.slug, tg]));
  const selectedCount = tags.filter((tg) => isFollowing(tg.id)).length;
  const atLimit = selectedCount >= MAX_INTERESTS;

  // Rule 2 of the intent pages: a module with no data does not render. If the
  // vocabulary resolved to nothing, showing empty headings would be worse than
  // showing nothing.
  if (tags.length === 0) return null;

  const blurb = t(
    'people.interests.blurb',
    'Pick a few. They shape what we suggest, and they are how other members find people with something in common.',
  );

  // Signed out: no picker. A grid of buttons that cannot be pressed reads as
  // broken; the honest version is one sentence of purpose and the way in.
  if (!signedIn) {
    return (
      <section
        className={cn(
          'flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between',
          className,
        )}
      >
        <div className="flex items-start gap-4">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted"
            aria-hidden
          >
            <Heart size={20} />
          </span>
          <div>
            <h3 className="text-title font-bold">
              {t('people.interests.title', 'What are you into?')}
            </h3>
            <p className="mt-1 max-w-prose text-13 text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <LocalizedLink to="/auth?redirect=/meet" className="no-underline">
            <LogIn aria-hidden /> {t('people.interests.signIn', 'Sign in to pick interests')}
          </LocalizedLink>
        </Button>
      </section>
    );
  }

  return (
    <section className={cn('rounded-container bg-card p-6 shadow-soft', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-title font-bold">
            {t('people.interests.title', 'What are you into?')}
          </h3>
          <p className="mt-1 max-w-prose text-13 text-muted-foreground">{blurb}</p>
        </div>
        <p
          className="rounded-badge bg-muted px-2 py-1 text-xs font-bold tabular-nums"
          aria-live="polite"
        >
          {t('people.interests.limit', {
            defaultValue: '{{count}} of {{max}} picked',
            count: selectedCount,
            max: MAX_INTERESTS,
          })}
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        {INTEREST_GROUPS.map((group) => {
          const groupTags = group.slugs.map((s) => bySlug.get(s)).filter(Boolean) as InterestTag[];
          if (groupTags.length === 0) return null;
          const Icon = GROUP_ICONS[group.label] ?? Heart;
          return (
            <div key={group.label} className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-start">
              <p className="inline-flex min-h-9 items-center gap-2 text-xs font-bold text-muted-foreground">
                <Icon size={16} aria-hidden />
                {group.label}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {groupTags.map((tg) => {
                  const on = isFollowing(tg.id);
                  return (
                    <li key={tg.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={!on && atLimit}
                        onClick={() => toggleFollow({ tagId: tg.id, name: tg.name, slug: tg.slug })}
                        className={cn(
                          'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4 py-1 text-13 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          on
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background hover:border-foreground/50',
                        )}
                      >
                        {on && <Check size={14} aria-hidden="true" />}
                        {tg.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {atLimit && (
        <p className="mt-4 text-13 text-muted-foreground">
          {t('people.interests.atLimit', 'That is the limit. Remove one to pick another.')}
        </p>
      )}
    </section>
  );
}

export default InterestPicker;
