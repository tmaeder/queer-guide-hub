import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { Button } from '@/components/ui/button';
import { List, ChevronDown, ChevronUp } from 'lucide-react';
import { transition } from '@/lib/animation';

interface Section {
  id: string;
  title: string;
}

interface LegalPageLayoutProps {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  sections: Section[];
  children: React.ReactNode;
}

export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  subtitle,
  lastUpdated,
  sections,
  children,
}) => {
  const [tocOpen, setTocOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    const handleScroll = () => {
      for (const section of [...sections].reverse()) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(section.id);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setTocOpen(false);
  };

  return (
    <Container sx={{ py: 4, maxWidth: 1100 }}>
      {/* Header */}
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1, maxWidth: 600 }}>
          {subtitle}
        </Typography>
      )}
      {lastUpdated && (
        <Typography variant="caption" color="text.disabled" sx={{ mb: 4, display: 'block' }}>
          Last updated {lastUpdated}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 0, md: 4 }, alignItems: 'flex-start', mt: 3 }}>
        {/* Sidebar TOC — desktop */}
        <Box sx={{
          display: { xs: 'none', md: 'block' },
          position: 'sticky',
          top: 80,
          minWidth: 200,
          maxWidth: 240,
          flexShrink: 0,
        }}>
          <Box sx={{ bgcolor: 'background.paper', p: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, px: 1, display: 'block', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              On this page
            </Typography>
            <Box component="nav" aria-label="Table of contents">
              {sections.map((s) => (
                <Box
                  key={s.id}
                  component="button"
                  onClick={() => scrollToSection(s.id)}
                  sx={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    px: 1,
                    py: 0.5,
                    border: 'none',
                    borderLeft: 2,
                    borderColor: activeSection === s.id ? 'brand.main' : 'transparent',
                    bgcolor: 'transparent',
                    color: activeSection === s.id ? 'text.primary' : 'text.secondary',
                    fontWeight: activeSection === s.id ? 600 : 400,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    transition: transition.fast,
                    '&:hover': { color: 'text.primary', borderColor: 'text.disabled' },
                  }}
                >
                  {s.title}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Mobile TOC */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, width: '100%', mb: 3 }}>
          <Button
            variant="outline"
            onClick={() => setTocOpen(!tocOpen)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}
            aria-expanded={tocOpen}
            aria-label="Table of contents"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <List style={{ width: 16, height: 16 }} />
              {activeSection
                ? `${sections.findIndex(s => s.id === activeSection) + 1} of ${sections.length} sections`
                : 'Contents'}
            </span>
            {tocOpen ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
          </Button>
          {tocOpen && (
            <Box sx={{ mt: 1, bgcolor: 'background.paper', p: 1.5 }}>
              {sections.map((s) => (
                <Box
                  key={s.id}
                  component="button"
                  onClick={() => scrollToSection(s.id)}
                  sx={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    px: 1,
                    py: 0.75,
                    border: 'none',
                    bgcolor: 'transparent',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    color: activeSection === s.id ? 'text.primary' : 'text.secondary',
                    fontWeight: activeSection === s.id ? 600 : 400,
                    transition: transition.fast,
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {s.title}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Main Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {children}

          {/* Contact footer */}
          <Box sx={{ mt: 6, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              Questions? We're real humans at{' '}
              <Box
                component="a"
                href="mailto:legal@queer.guide"
                sx={{ color: 'brand.main', '&:hover': { opacity: 0.85 } }}
              >
                legal@queer.guide
              </Box>
            </Typography>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};
