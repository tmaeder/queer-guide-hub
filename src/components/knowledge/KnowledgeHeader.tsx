import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { cn } from '@/lib/utils';

interface KnowledgeHeaderProps {
  section: 'terms' | 'personalities' | 'history' | 'rights';
  children?: ReactNode;
}

/** The glossary, people directory, history timeline and rights index share one URL-backed workspace. */
export function KnowledgeHeader({ section, children }: KnowledgeHeaderProps) {
  const { t } = useTranslation();
  const sections: readonly {
    id: KnowledgeHeaderProps['section'];
    to: string;
    icon: TransitIconName;
    label: string;
    hint: string;
  }[] = [
    {
      id: 'terms',
      to: '/tags',
      icon: 'library',
      label: t('knowledge.terms', 'Terms'),
      hint: t('knowledge.termsHint', 'The words we use, defined'),
    },
    {
      id: 'personalities',
      to: '/personalities',
      icon: 'profile',
      label: t('knowledge.personalities', 'Personalities'),
      hint: t('knowledge.personalitiesHint', 'People who shaped queer life'),
    },
    {
      id: 'history',
      to: '/history',
      icon: 'hours',
      label: t('knowledge.history', 'History'),
      hint: t('knowledge.historyHint', 'Milestones, year by year'),
    },
    // /rights folded into Knowledge (2026-11-01). The page keeps its own
    // composite layout; this tab is how the glossary reaches it.
    {
      id: 'rights',
      to: '/tags/rights-by-country',
      icon: 'march',
      label: t('knowledge.rights', 'Rights by country'),
      hint: t('knowledge.rightsHint', 'What the law says, by country'),
    },
  ];

  return (
    <PageContainer as="header" className="pb-0 md:pb-0">
      <PageIntro
        title={t('knowledge.title', 'Knowledge')}
        lede={t(
          'knowledge.lede',
          'The words we use, the people who shaped queer life, and the history behind both.',
        )}
      />
      {/* Four section tiles, not four bare tabs. The hint is wired with
          aria-describedby rather than folded into the link text, so each tab's
          accessible name stays exactly its label ("Terms") and speech users can
          say what they see. */}
      <nav
        aria-label={t('knowledge.navigation', 'Knowledge sections')}
        className="mt-6 border-b border-border-hairline pb-6"
      >
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 lg:grid-cols-4">
          {sections.map((item) => {
            const active = section === item.id;
            const hintId = `knowledge-tab-hint-${item.id}`;
            return (
              <li key={item.id} className="min-w-0">
                <LocalizedLink
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  aria-describedby={hintId}
                  className={cn(
                    'group flex h-full min-h-11 items-center gap-2 rounded-container px-2 py-2 no-underline sm:gap-4 sm:px-4 sm:py-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-card text-foreground shadow-soft hover:bg-surface-container',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10',
                      active ? 'bg-background text-foreground' : 'bg-surface-container',
                    )}
                  >
                    <TransitIcon name={item.icon} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-13 font-bold leading-tight sm:text-15">
                      {item.label}
                    </span>
                    <span
                      id={hintId}
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 hidden text-13 leading-snug sm:line-clamp-1',
                        active ? 'text-background/75' : 'text-muted-foreground',
                      )}
                    >
                      {item.hint}
                    </span>
                  </span>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {children && <div className="mt-6">{children}</div>}
    </PageContainer>
  );
}
