import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TagLinkedContent } from '@/components/tags/TagLinkedContent';
import type { KinkFilterTermRow } from '@/hooks/useKinkFilterTerms';

/**
 * /tags/:slug for a kink & feature term, shown to a signed-out reader who has
 * confirmed 18+. The full glossary entry stays signed-in only (sensitive
 * tags are hidden from anon); this shows the term's name, one-line summary,
 * and the upcoming parties and venues that carry it.
 */
export function KinkTermPage({ term }: { term: KinkFilterTermRow }) {
  const { t } = useTranslation();
  return (
    <PageContainer data-testid="kink-term-page" className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display">{term.label}</h1>
        {term.short_description && (
          <p className="text-body-lg text-muted-foreground">{term.short_description}</p>
        )}
        <p className="text-13 text-muted-foreground">
          {t('kinkTerm.signInForEntry', 'Sign in to read the full glossary entry.')}{' '}
          <LocalizedLink to="/kinks">
            {t('kinkFilters.browseAll', 'Browse all kinks & features')}
          </LocalizedLink>
        </p>
      </header>
      <TagLinkedContent tagId={term.tag_id} tagName={term.name} tagSlug={term.slug} />
    </PageContainer>
  );
}
