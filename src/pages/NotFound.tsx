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
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <NotFoundMeta title={t('pages.notFound.title', 'Page not found')} />
      <div className="text-center max-w-md mx-auto px-4">
        <h2 className="text-5xl font-bold mb-4">404</h2>
        <h6 className="text-base font-semibold mb-2">
          {t('pages.notFound.title', 'Page not found')}
        </h6>
        <p className="text-muted-foreground mb-8">
          {t('pages.notFound.description', "The page you're looking for doesn't exist or has been moved.")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            style={{ display: 'inline-flex', gap: 8 }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} aria-hidden="true" />
            {t('pages.notFound.goBack', 'Go Back')}
          </Button>
          <Button asChild style={{ display: 'inline-flex', gap: 8 }}>
            <LocalizedLink to="/">
              <Home style={{ width: 16, height: 16 }} aria-hidden="true" />
              {t('pages.notFound.returnHome', 'Return Home')}
            </LocalizedLink>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
