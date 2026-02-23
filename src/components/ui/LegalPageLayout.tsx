import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUp, List, ChevronDown, ChevronUp } from 'lucide-react';

interface Section {
  id: string;
  title: string;
}

interface LegalPageLayoutProps {
  title: string;
  lastUpdated?: string;
  sections: Section[];
  children: React.ReactNode;
}

export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  lastUpdated,
  sections,
  children,
}) => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);

      // Track active section
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

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Page Title */}
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      {lastUpdated && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Last updated: {lastUpdated}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        {/* Sidebar TOC — desktop only */}
        <Box sx={{
          display: { xs: 'none', md: 'block' },
          position: 'sticky',
          top: 80,
          minWidth: 220,
          maxWidth: 260,
          flexShrink: 0,
        }}>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, px: 1 }}>
                Contents
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
                      py: 0.75,
                      borderRadius: 1,
                      border: 'none',
                      bgcolor: activeSection === s.id ? 'action.hover' : 'transparent',
                      color: activeSection === s.id ? 'text.primary' : 'text.secondary',
                      fontWeight: activeSection === s.id ? 600 : 400,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    }}
                  >
                    {s.title}
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Mobile TOC — collapsible */}
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
              Contents
            </span>
            {tocOpen ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
          </Button>
          {tocOpen && (
            <Card sx={{ mt: 1 }}>
              <CardContent sx={{ p: 2 }}>
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
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    {s.title}
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Main Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>

      {/* Back to Top */}
      {showBackToTop && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={scrollToTop}
            aria-label="Back to top"
            style={{
              borderRadius: '50%',
              width: 44,
              height: 44,
              padding: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              backgroundColor: '#ffffff',
            }}
          >
            <ArrowUp style={{ width: 20, height: 20 }} />
          </Button>
        </Box>
      )}
    </Container>
  );
};
