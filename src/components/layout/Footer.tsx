import { Link, useNavigate, useLocation } from 'react-router';
import { ChevronUp, FileText, Shield, Lock, Cookie, Copyright, Scale, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

export function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentYear = new Date().getFullYear();

  const getSubmitCta = () => {
    if (location.pathname.startsWith('/events'))
      return { label: 'Submit Event', route: '/submit/event' };
    if (location.pathname.startsWith('/venues'))
      return { label: 'Submit Venue', route: '/submit/venue' };
    return { label: 'Submit a Space', route: '/submit/venue' };
  };
  const submitCta = getSubmitCta();

  const legalLinks = [
    { href: '/legal', label: 'Legal', icon: Shield },
    { href: '/terms', label: 'Terms', icon: Scale },
    { href: '/privacy', label: 'Privacy', icon: Lock },
    { href: '/cookies', label: 'Cookies', icon: Cookie },
    { href: '/dmca', label: 'DMCA', icon: Copyright },
  ];

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.default',
        borderTop: 1,
        borderColor: 'divider',
        mt: 'auto',
      }}
    >
      <Container maxWidth="lg" sx={{ py: 1.5 }}>
        {/* Single Row Layout */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            &copy; {currentYear} Queer Guide. All rights reserved.
          </Typography>

          {/* Legal Links */}
          <Box
            component="nav"
            aria-label="Legal"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}
          >
            {legalLinks.map((link) => (
              <Link key={link.href} to={link.href} style={{ textDecoration: 'none' }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    px: 1,
                    py: 0.5,
                    display: 'inline-block',
                    '&:hover': { color: 'primary.main' },
                    transition: 'color 0.2s',
                  }}
                >
                  {link.label}
                </Typography>
              </Link>
            ))}
          </Box>

          {/* Quick Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="default"
              size="sm"
              style={{
                minHeight: 44,
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
              onClick={() => navigate(submitCta.route)}
            >
              <Plus style={{ width: 14, height: 14 }} />
              {submitCta.label}
            </Button>
            <Separator orientation="vertical" style={{ height: 24 }} />
            <Button
              variant="ghost"
              size="sm"
              style={{ minWidth: 44, minHeight: 44, fontSize: '0.75rem' }}
              aria-label="Scroll to top"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ChevronUp style={{ width: 16, height: 16 }} />
            </Button>
            <Separator orientation="vertical" style={{ height: 24 }} />
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sitemap"
              style={{ minWidth: 44, minHeight: 44, fontSize: '0.75rem' }}
              onClick={() => navigate('/sitemap')}
            >
              <FileText style={{ width: 16, height: 16 }} />
            </Button>
            <ThemeToggle />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
