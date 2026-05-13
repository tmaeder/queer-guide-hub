import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocation } from 'react-router';
import { useEffect } from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
      <NotFoundMeta title={t('pages.notFound.title', 'Page not found')} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-mesh opacity-80" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-spotlight" />
      <div className="relative text-center max-w-lg mx-auto px-6 py-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-foreground" />
          404
        </div>
        <h1 className="text-balance text-5xl md:text-7xl font-extrabold leading-[1] tracking-tight mb-4 text-gradient-fg">
          {t('pages.notFound.title', 'Page not found')}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-md mx-auto leading-relaxed mb-10">
          {t('pages.notFound.description', "The page you're looking for doesn't exist or has been moved.")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => window.history.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('pages.notFound.goBack', 'Go Back')}
          </Button>
          <Button asChild size="lg" className="gap-2">
            <LocalizedLink to="/">
              <Home className="h-4 w-4" aria-hidden="true" />
              {t('pages.notFound.returnHome', 'Return Home')}
            </LocalizedLink>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
