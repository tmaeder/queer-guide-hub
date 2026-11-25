import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { stripLocale } from '@/lib/locale';

export function PeopleLocationError({ retry }: { retry?: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.delete('city');
  params.delete('cityId');
  const search = params.toString();
  return (
    <div role="alert" className="space-y-4 py-4">
      <p>
        {t(
          'meetConsolidation.context.unavailable',
          'The selected city could not be loaded. Choose another city or try again.',
        )}
      </p>
      <div className="flex flex-wrap gap-4">
        {retry ? (
          <Button variant="outline" onClick={retry}>
            {t('meetConsolidation.discovery.retry', 'Try again')}
          </Button>
        ) : null}
        <Button variant="outline" asChild>
          <LocalizedLink to={`${stripLocale(location.pathname)}${search ? `?${search}` : ''}`}>
            {t('meetConsolidation.context.clear', 'Clear city')}
          </LocalizedLink>
        </Button>
      </div>
    </div>
  );
}

export function PeopleDiscoveryError({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="space-y-4 py-4">
      <p>{t('meetConsolidation.discovery.error', 'People could not be loaded. Try again.')}</p>
      <Button variant="outline" onClick={retry}>
        {t('meetConsolidation.discovery.retry', 'Try again')}
      </Button>
    </div>
  );
}

export function PeopleSignInNotice() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <div className="space-y-4 py-4">
      <p>
        {t(
          'meetConsolidation.discovery.signInBody',
          'Sign in to find people and make connections.',
        )}
      </p>
      <Button asChild>
        <LocalizedLink to="/auth" state={{ from: `${location.pathname}${location.search}` }}>
          {t('meetConsolidation.discovery.signIn', 'Sign in')}
        </LocalizedLink>
      </Button>
    </div>
  );
}
