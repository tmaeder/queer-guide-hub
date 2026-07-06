import { useTranslation } from 'react-i18next';
import { Heart, ArrowRight, MessageCircle } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useIntimateMatches } from '@/hooks/useIntimateMatches';

/**
 * Contacts/Messages → Dating: a live entry point into the age-walled People
 * dating deck and the viewer's match conversations. Renders ONLY for users who
 * have already opted into an intimate profile (useMyIntimateProfile returns
 * null otherwise) — the same self-gating the intimate surfaces use, so nothing
 * about dating is exposed to non-opted-in users.
 *
 * Matches are real conversations (conversation_type='match'); "Your matches"
 * deep-links into the Messages inbox pre-filtered to the Matches lens rather
 * than duplicating a match list here. Discovery stays behind the deck's own
 * gating at /people/dating.
 */
export function DatingSection() {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useMyIntimateProfile();
  const { data: matches } = useIntimateMatches();

  if (isLoading || !profile) return null;

  const matchCount = matches?.length ?? 0;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title font-display">
          {t('hub.contacts.dating', { defaultValue: 'Dating' })}
        </h2>
        {matchCount > 0 && (
          <LocalizedLink
            to="/hub/messages?filter=matches"
            className="flex items-center gap-1 text-13 text-muted-foreground no-underline hover:text-foreground"
          >
            {t('hub.contacts.datingMatches', {
              defaultValue: '{{count}} matches',
              count: matchCount,
            })}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </LocalizedLink>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <LocalizedLink
          to="/people/dating"
          className="flex items-center gap-2 rounded-element border border-border px-4 py-4 no-underline transition-colors hover:bg-muted"
        >
          <Heart className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t('hub.contacts.browseDeck', { defaultValue: 'Browse deck' })}
            </p>
            <p className="text-13 text-muted-foreground">
              {t('hub.contacts.browseDeckBody', { defaultValue: 'Find new people to match with.' })}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </LocalizedLink>

        <LocalizedLink
          to="/hub/messages?filter=matches"
          className="flex items-center gap-2 rounded-element border border-border px-4 py-4 no-underline transition-colors hover:bg-muted"
        >
          <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t('hub.contacts.yourMatches', { defaultValue: 'Your matches' })}
            </p>
            <p className="text-13 text-muted-foreground">
              {matchCount > 0
                ? t('hub.contacts.yourMatchesBody', {
                    defaultValue: '{{count}} match conversations',
                    count: matchCount,
                  })
                : t('hub.contacts.yourMatchesEmpty', { defaultValue: 'No matches yet.' })}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </LocalizedLink>
      </div>
    </section>
  );
}
