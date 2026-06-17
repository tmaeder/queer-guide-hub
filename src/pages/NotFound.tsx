import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocation } from 'react-router';
import { useEffect } from 'react';
import { Home, ArrowLeft, MapPin, CalendarDays, Map, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';

const SUGGESTIONS = [
  { to: '/venues', icon: MapPin, labelKey: 'nav.venues', fallback: 'Venues' },
  { to: '/events', icon: CalendarDays, labelKey: 'nav.events', fallback: 'Events' },
  { to: '/map', icon: Map, labelKey: 'nav.map', fallback: 'Map' },
  { to: '/community', icon: Users, labelKey: 'nav.community', fallback: 'Community' },
] as const;

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <NotFoundMeta title={t('pages.notFound.title', 'Page not found')} />
      <div className="text-center max-w-lg mx-auto px-4 py-16">
        <h2 className="font-display text-display md:text-hero font-bold mb-4">404</h2>
        <h6 className="text-title font-semibold mb-2">
          {t('pages.notFound.title', 'Page not found')}
        </h6>
        <p className="text-muted-foreground mb-8">
          {t(
            'pages.notFound.description',
            "The page you're looking for doesn't exist or has been moved.",
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            style={{ display: 'inline-flex', gap: 8 }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t('pages.notFound.goBack', 'Go Back')}
          </Button>
          <Button asChild className="inline-flex gap-2">
            <LocalizedLink to="/">
              <Home size={16} aria-hidden="true" />
              {t('pages.notFound.returnHome', 'Return Home')}
            </LocalizedLink>
          </Button>
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-xs2 font-medium uppercase tracking-[0.14em] text-muted-foreground mb-4">
            {t('pages.notFound.suggestionsLabel', 'Or jump to')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUGGESTIONS.map(({ to, icon: Icon, labelKey, fallback }) => (
              <LocalizedLink
                key={to}
                to={to}
                className="flex flex-col items-center gap-2 rounded-element border border-border bg-background px-4 py-6 no-underline transition-colors hover:bg-surface-container hover:border-foreground/30"
              >
                <Icon size={20} aria-hidden="true" className="text-muted-foreground" />
                <span className="text-13 font-medium text-foreground">{t(labelKey, fallback)}</span>
              </LocalizedLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
