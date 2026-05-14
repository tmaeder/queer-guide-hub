import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { List, ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

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

export const LegalPageLayout = ({
  title,
  subtitle,
  lastUpdated,
  sections,
  children,
}: LegalPageLayoutProps) => {
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
    <div className="container mx-auto py-8 px-4" style={{ maxWidth: 1100 }}>
      <PageHeader
        eyebrow={lastUpdated ? `Last updated ${lastUpdated}` : 'Legal'}
        title={title}
        subtitle={subtitle}
      />

      <div className="flex flex-col md:flex-row md:gap-8 items-start">
        {/* Sidebar TOC — desktop */}
        <div className="hidden md:block sticky flex-shrink-0" style={{ top: 96, minWidth: 220, maxWidth: 260 }}>
          <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-4 shadow-sm">
            <span className="text-xs font-semibold mb-2 px-2 block uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
              On this page
            </span>
            <nav aria-label="Table of contents">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="block w-full text-left px-2 py-1 transition-colors hover:text-foreground"
                  style={{
                    border: 'none',
                    borderLeft: `2px solid ${activeSection === s.id ? 'hsl(var(--foreground))' : 'transparent'}`,
                    backgroundColor: 'transparent',
                    color: activeSection === s.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    fontWeight: activeSection === s.id ? 600 : 400,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                >
                  {s.title}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Mobile TOC */}
        <div className="block md:hidden w-full mb-6">
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
            <div className="mt-2 bg-background p-3">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="block w-full text-left px-2 py-1.5 transition-colors hover:text-foreground"
                  style={{
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '0.875rem',
                    color: activeSection === s.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    fontWeight: activeSection === s.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {children}

          <div className="mt-12 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Questions? We're real humans at{' '}
              <a href="mailto:legal@queer.guide" className="hover:opacity-85" style={{ color: 'hsl(var(--foreground))' }}>
                legal@queer.guide
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
