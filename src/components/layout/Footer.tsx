import { Link } from 'react-router';
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { categoryColor } from '@/lib/categoryColors';

const linkGroups = [
  {
    title: 'Discover',
    links: [
      { href: '/venues', label: 'Venues' },
      { href: '/events', label: 'Events' },
      { href: '/places', label: 'Places' },
      { href: '/map', label: 'Map' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { href: '/groups', label: 'Groups' },
      { href: '/feed', label: 'Feed' },
      { href: '/members', label: 'Members' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/feedback', label: 'Feedback' },
      { href: '/legal', label: 'Legal' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/contact', label: 'Contact' },
      { href: '/donate', label: 'Support Us' },
    ],
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.default',
        borderTop: 3,
        borderImage: `linear-gradient(90deg, ${categoryColor('venues')}, ${categoryColor('events')}, ${categoryColor('marketplace')}, ${categoryColor('places')}, ${categoryColor('hotels')}, ${categoryColor('community')}) 1`,
        mt: 'auto',
      }}
    >
      <Container
        maxWidth="lg"
        sx={{ py: { xs: 4, md: 6 } }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 2fr auto' },
            gap: { xs: 4, md: 6 },
            alignItems: 'start',
          }}
        >
          {/* Col 1: Brand */}
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Queer Guide
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Your world. Your way.
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', md: 'block' }, mt: 2 }}
            >
              &copy; {currentYear} Queer Guide. All rights reserved.
            </Typography>
          </Box>

          {/* Col 2: Quick links */}
          <Box
            component="nav"
            aria-label="Footer navigation"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              gap: { xs: 3, sm: 4 },
            }}
          >
            {linkGroups.map((group) => (
              <Box key={group.title}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1, display: 'block' }}
                >
                  {group.title}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {group.links.map((link) => (
                    <Link key={link.href} to={link.href} style={{ textDecoration: 'none' }}>
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
                  ))}
                </Box>
              </Box>
            ))}
          </Box>

          {/* Col 3: Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="Scroll to top"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ChevronUp style={{ width: 16, height: 16 }} />
            </Button>
          </Box>
        </Box>

        {/* Mobile copyright */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: 'block', md: 'none' }, mt: 4, textAlign: 'center' }}
        >
          &copy; {currentYear} Queer Guide. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}
