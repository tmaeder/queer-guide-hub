import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocation } from 'react-router';
import { useEffect } from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <Box
      sx={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ textAlign: 'center', maxWidth: '28rem', mx: 'auto', px: 2 }}>
        <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>
          404
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {t('pages.notFound.title', 'Page not found')}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          {t('pages.notFound.description', "The page you're looking for doesn't exist or has been moved.")}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1.5,
            justifyContent: 'center',
          }}
        >
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
        </Box>
      </Box>
    </Box>
  );
};

export default NotFound;
