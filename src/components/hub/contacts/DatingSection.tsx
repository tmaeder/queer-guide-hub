import { useTranslation } from 'react-i18next';
import { Heart, ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';

/**
 * Contacts → Dating: a link card into the age-walled People dating deck.
 * Renders ONLY for users who have already opted into an intimate profile
 * (useMyIntimateProfile returns null otherwise) — the same self-gating the
 * intimate surfaces use, so nothing about dating is exposed to non-opted-in
 * users. Deliberately a link, not an inline match list: matches remain behind
 * the intimate components' own gating at /people/dating.
 */
export function DatingSection() {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useMyIntimateProfile();

  if (isLoading || !profile) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-display">
        {t('hub.contacts.dating', { defaultValue: 'Dating' })}
      </h2>
      <LocalizedLink
        to="/people/dating"
        className="flex items-center gap-2 rounded-element border border-border px-4 py-4 no-underline transition-colors hover:bg-muted"
      >
        <Heart className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t('hub.contacts.datingTitle', { defaultValue: 'Your dating deck' })}
          </p>
          <p className="text-13 text-muted-foreground">
            {t('hub.contacts.datingBody', { defaultValue: 'Browse matches and conversations.' })}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </LocalizedLink>
    </section>
  );
}
