import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MeetNavBar } from '@/components/meet/MeetNav';

/**
 * What a signed-out reader sees on a Meet page that needs an account: the
 * page's own title inside the Meet section, and a sign-in link that brings
 * them back to this exact page (path and query) afterwards. Auth.tsx reads
 * the return path from `state.from`.
 */
export function MeetSignInPrompt({ title }: { title: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <>
      <MeetNavBar />
      <PageContainer size="form" className="text-center">
        <h1 className="font-display text-headline">{title}</h1>
        <p className="mt-4 text-muted-foreground">{t('auth.signinBlurb', 'Sign in to continue')}</p>
        <Button asChild className="mt-6">
          <LocalizedLink to="/auth" state={{ from: `${location.pathname}${location.search}` }}>
            {t('auth.signIn', 'Sign in')}
          </LocalizedLink>
        </Button>
      </PageContainer>
    </>
  );
}
