import React from 'react';
import Box from '@mui/material/Box';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TripContextBar } from '@/components/trips/TripContextBar';
import { CookieConsentBanner } from '@/components/privacy/CookieConsentBanner';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';

/**
 * Visual chrome around the route content: header, footer, banners, skip-link, background.
 * Children are the route table (`<AppRoutes />`).
 */
export const LayoutShell = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: 'background.default',
    }}
  >
    {/* Skip link for keyboard users (a11y: WCAG 2.4.1) */}
    <Box
      component="a"
      href="#main-content"
      sx={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
        zIndex: 9999,
        '&:focus': {
          position: 'fixed',
          top: 8,
          left: 8,
          width: 'auto',
          height: 'auto',
          overflow: 'visible',
          bgcolor: 'background.paper',
          color: 'text.primary',
          px: 2,
          py: 1,
          borderRadius: 1,
          boxShadow: 3,
          fontWeight: 600,
          fontSize: '0.875rem',
          textDecoration: 'none',
          outline: '3px solid',
          outlineColor: 'primary.main',
          outlineOffset: '2px',
        },
      }}
    >
      Skip to main content
    </Box>

    {/* Background — solid color, no decorative effects */}
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : '#ffffff',
      })}
    />
    <AnalyticsTracker />
    <Box sx={{ position: 'relative', zIndex: 1 }}>
      <Header />
      <TripContextBar />
    </Box>
    {children}
    <Box sx={{ position: 'relative', zIndex: 1 }}>
      <Footer />
    </Box>
    <CookieConsentBanner />
    <FeedbackButton />
    <InstallBanner />
  </Box>
);
