import { useState } from 'react';
import { X, Cookie, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import { Link } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);

  if (!showBanner) return null;

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 60,
          p: 2,
          bgcolor: 'rgba(var(--background), 0.95)',
          backdropFilter: 'blur(8px)',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Card style={{ padding: 24, maxWidth: 896, margin: '0 auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Cookie
              style={{
                height: 24,
                width: 24,
                color: 'var(--muted-foreground)',
                marginTop: 4,
                flexShrink: 0,
              }}
            />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Cookie Settings
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  We use cookies to enhance your experience, analyze site traffic, and personalize
                  content. You can manage your preferences or learn more in our{' '}
                  <Box
                    component={Link}
                    to="/legal"
                    sx={{ textDecoration: 'underline', '&:hover': { color: 'text.primary' } }}
                  >
                    Legal Hub
                  </Box>
                  , including our{' '}
                  <Box
                    component={Link}
                    to="/privacy"
                    sx={{ textDecoration: 'underline', '&:hover': { color: 'text.primary' } }}
                  >
                    Privacy Policy
                  </Box>{' '}
                  and{' '}
                  <Box
                    component={Link}
                    to="/cookies"
                    sx={{ textDecoration: 'underline', '&:hover': { color: 'text.primary' } }}
                  >
                    Cookie Policy
                  </Box>
                  .
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                <Button onClick={acceptAll} size="sm">
                  Accept All
                </Button>
                <Button onClick={acceptNecessary} variant="outline" size="sm">
                  Necessary Only
                </Button>
                <Button
                  onClick={() => setShowPreferences(true)}
                  variant="ghost"
                  size="sm"
                  style={{ display: 'inline-flex', gap: 8 }}
                >
                  <Settings style={{ height: 16, width: 16 }} />
                  Customize
                </Button>
              </Box>
            </Box>
          </Box>
        </Card>
      </Box>

      <CookiePreferencesDialog open={showPreferences} onOpenChange={setShowPreferences} />
    </>
  );
}
