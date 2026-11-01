import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';

interface KnowledgeHeaderProps {
  section: 'terms' | 'personalities' | 'history' | 'rights';
  children?: ReactNode;
}

/** The glossary, people directory, history timeline and rights index share one URL-backed workspace. */
export function KnowledgeHeader({ section, children }: KnowledgeHeaderProps) {
  const { t } = useTranslation();
  const sections = [
    { id: 'terms', to: '/tags', label: t('knowledge.terms', 'Terms') },
    {
      id: 'personalities',
      to: '/personalities',
      label: t('knowledge.personalities', 'Personalities'),
    },
    { id: 'history', to: '/history', label: t('knowledge.history', 'History') },
    // /rights folded into Knowledge (2026-11-01). The page keeps its own
    // composite layout; this tab is how the glossary reaches it.
    {
      id: 'rights',
      to: '/tags/rights-by-country',
      label: t('knowledge.rights', 'Rights by country'),
    },
  ] as const;

  return (
    <PageContainer as="header" className="pb-0 md:pb-0">
      <h1 className="text-display font-bold leading-tight md:text-hero">
        {t('knowledge.title', 'Knowledge')}
      </h1>
      <p className="mt-4 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
        {t(
          'knowledge.lede',
          'The words we use, the people who shaped queer life, and the history behind both.',
        )}
      </p>
      <nav
        aria-label={t('knowledge.navigation', 'Knowledge sections')}
        className="mt-6 flex flex-wrap gap-2 border-b border-border-hairline pb-4"
      >
        {sections.map((item) => (
          <LocalizedLink
            key={item.id}
            to={item.to}
            aria-current={section === item.id ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center px-4 py-2 text-13 font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
              section === item.id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </LocalizedLink>
        ))}
      </nav>
      {children && <div className="mt-6">{children}</div>}
    </PageContainer>
  );
}
