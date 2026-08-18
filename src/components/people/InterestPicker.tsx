import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
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
export function InterestPicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { isFollowing, toggleFollow, signedIn } = useFollowedTags();

  const { data: tags = [] } = useInterestVocabularyTags();

  const bySlug = new Map(tags.map((tg) => [tg.slug, tg]));
  const selectedCount = tags.filter((tg) => isFollowing(tg.id)).length;

  // Rule 2 of the intent pages: a module with no data does not render. If the
  // vocabulary resolved to nothing, showing empty headings would be worse than
  // showing nothing.
  if (tags.length === 0) return null;

  return (
    <section className={cn('bg-muted rounded-container p-6', className)}>
      <h3 className="text-title font-bold">{t('people.interests.title', 'What are you into?')}</h3>
      <p className="mt-2 max-w-prose text-13 text-muted-foreground">
        {signedIn
          ? t(
              'people.interests.blurb',
              'Pick a few. They shape what we suggest, and they are how other members find people with something in common.',
            )
          : t(
              'people.interests.blurbSignedOut',
              'Sign in to pick a few. They shape what we suggest, and they are how other members find people with something in common.',
            )}
      </p>

      {INTEREST_GROUPS.map((group) => {
        const groupTags = group.slugs.map((s) => bySlug.get(s)).filter(Boolean) as InterestTag[];
        if (groupTags.length === 0) return null;
        return (
          <div key={group.label} className="mt-6">
            <p className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
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
                      onClick={() => toggleFollow({ tagId: tg.id, name: tg.name, slug: tg.slug })}
                      className={cn(
                        'inline-flex items-center gap-1.5 bg-muted rounded-element px-4 py-2 text-13 font-bold transition-colors',
                        on ? 'bg-foreground text-background' : 'hover:bg-surface-container',
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

      {signedIn && selectedCount > 0 && (
        <p className="mt-6 text-13 text-muted-foreground tabular-nums">
          {t('people.interests.count', '{{count}} selected', { count: selectedCount })}
        </p>
      )}
    </section>
  );
}

export default InterestPicker;
