import { Link } from 'react-router';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const footerLinks = [
  { href: '/about', label: 'About' },
  { href: '/legal', label: 'Legal' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
  { href: '/donate', label: 'Support Us' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.default',
        mt: 'auto',
      }}
    >
      <Box
        sx={{ width: '100%', px: { xs: 2, sm: 3, md: 4 }, py: 2, position: 'relative' }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box
            component="nav"
            aria-label="Footer navigation"
            sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}
          >
            {footerLinks.map((link, i) => (
              <Box key={link.href} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {i > 0 && (
                  <Typography variant="caption" color="text.secondary" aria-hidden>
                    ·
                  </Typography>
                )}
                <Link to={link.href} style={{ textDecoration: 'none' }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      '&:hover': { color: 'primary.main' },
                      transition: 'color 0.2s',
                    }}
                  >
                    {link.label}
                  </Typography>
                </Link>
              </Box>
            ))}
          </Box>

          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
            &copy; {currentYear} Queer Guide
          </Typography>
        </Box>

        <Box
          sx={{
            position: 'absolute',
            right: { xs: 16, sm: 24 },
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            style={{ minWidth: 36, minHeight: 36 }}
            aria-label="Scroll to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ChevronUp style={{ width: 14, height: 14 }} />
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
