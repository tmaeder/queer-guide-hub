import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { List, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditorialHero } from '@/components/editorial/EditorialHero';
import type { EditorialImage } from '@/lib/editorialImages';

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
  heroImage?: EditorialImage;
  eyebrow?: string;
}

export const LegalPageLayout = ({
  title,
  subtitle,
  lastUpdated,
  sections,
  children,
  heroImage,
  eyebrow,
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
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setTocOpen(false);
  };

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      {heroImage ? (
        <EditorialHero
          eyebrow={eyebrow ?? 'Legal'}
          title={title}
          subtitle={subtitle}
          image={heroImage}
          imagePosition="cover"
          decoration="none"
          height="sm"
          className="mb-6"
        />
      ) : (
        <header className="mb-2">
          <h1 className="font-bold text-headline-lg md:text-display">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-2xl text-body-lg leading-[1.6] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </header>
      )}
      {lastUpdated && (
        <p className="mb-8 mt-4 text-13 text-muted-foreground/70">Last updated {lastUpdated}</p>
      )}

      <div className="mt-6 flex flex-col items-start md:flex-row md:gap-12">
        {/* Sidebar TOC — desktop */}
        <div className="sticky top-20 hidden w-56 flex-shrink-0 md:block">
          <p className="mb-2 text-13 font-semibold uppercase tracking-label text-muted-foreground/70">
            On this page
          </p>
          <nav aria-label="Table of contents" className="flex flex-col">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className={cn(
                  'border-l-2 px-2 py-1.5 text-left text-13 leading-snug transition-colors',
                  activeSection === s.id
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile TOC */}
        <div className="mb-6 block w-full md:hidden">
          <Button
            variant="outline"
            onClick={() => setTocOpen(!tocOpen)}
            className="flex w-full justify-between"
            aria-expanded={tocOpen}
            aria-label="Table of contents"
          >
            <span className="flex items-center gap-2">
              <List size={16} />
              {activeSection
                ? `${sections.findIndex((s) => s.id === activeSection) + 1} of ${sections.length} sections`
                : 'Contents'}
            </span>
            {tocOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </Button>
          {tocOpen && (
            <div className="mt-2 flex flex-col rounded-element border border-border bg-card p-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className={cn(
                    'rounded-element px-2 py-2 text-left text-15 transition-colors',
                    activeSection === s.id
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="min-w-0 flex-1">
          {children}

          <div className="mt-12 border-t border-border pt-6">
            <p className="text-15 text-muted-foreground">
              Questions? We're real humans at{' '}
              <a href="mailto:legal@queer.guide" className="text-foreground hover:opacity-85">
                legal@queer.guide
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
