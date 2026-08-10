import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { PageContainer } from '@/components/layout/PageContainer';

/** "No ads. No data sales. Just riders." — the closing support band.
 *  Paper band with ink CTAs (template: Support section); auth-adaptive. */
export function SupportBand() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <section className="border-b-4 border-foreground">
      <PageContainer className="flex flex-wrap items-center justify-between gap-8">
        <div className="max-w-xl">
          <h2 className="font-display text-display">
            {t('home.support.title', 'No ads. No data sales. Just riders.')}
          </h2>
          <p className="mt-4 text-15 leading-relaxed">
            {t(
              'home.support.subtitle',
              'The guide is community-funded and community-verified. Verified safe spaces, real reviews, no paywalls.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user ? (
            <>
              <LocalizedLink
                to="/submit"
                className="border-2 border-foreground bg-foreground px-6 py-4 text-15 font-bold text-background no-underline hover:opacity-90"
              >
                {t('home.cta.submit', 'Add a venue')}
              </LocalizedLink>
              <LocalizedLink
                to="/friends"
                className="border-2 border-foreground px-6 py-4 text-15 font-bold no-underline hover:bg-foreground hover:text-background"
              >
                {t('home.cta.invite', 'Invite friends')}
              </LocalizedLink>
            </>
          ) : (
            <>
              <LocalizedLink
                to="/auth?mode=signup"
                className="border-2 border-foreground bg-foreground px-6 py-4 text-15 font-bold text-background no-underline hover:opacity-90"
              >
                {t('home.cta.join', 'Join the community')}
              </LocalizedLink>
              <LocalizedLink
                to="/about"
                className="border-2 border-foreground px-6 py-4 text-15 font-bold no-underline hover:bg-foreground hover:text-background"
              >
                {t('home.cta.about', 'Read the mission')}
              </LocalizedLink>
            </>
          )}
        </div>
      </PageContainer>
    </section>
  );
}
