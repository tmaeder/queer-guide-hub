import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useTagMythFacts } from '@/hooks/useStiProfile';

/**
 * Myths & facts band — the false beliefs that get people hurt, each with its
 * correction, from the tag_myth_facts ledger.
 *
 * SELF-SELECTING like the diagnostic codes: renders only when the tag carries
 * rows. THE KIND LABEL IS MANDATORY — a myth printed without its ✗ reads as
 * advice, so every row leads with the icon AND the word, monochrome ink
 * (icons + text carry the meaning, never colour).
 */

export function TagMythFacts({ tagId, tagName }: { tagId: string; tagName: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useTagMythFacts(tagId);
  const rows = data ?? [];

  if (isLoading || rows.length === 0) return null;

  const attribution = rows[0];

  return (
    <section className="border-y-4 border-foreground py-8">
      <Eyebrow as="p">{t('tags.myths.eyebrow', 'Check the facts')}</Eyebrow>
      <h2 className="mt-2 font-display text-headline leading-tight md:text-display">
        {t('tags.myths.title', 'Myths & facts about {{name}}', { name: tagName })}
      </h2>

      <ul className="mt-6 list-none space-y-4 p-0">
        {rows.map((row, i) => {
          const isMyth = row.kind === 'myth';
          const Icon = isMyth ? X : Check;
          return (
            <li key={i} className="border-2 border-foreground p-4">
              <p className="flex items-start gap-2 text-13 font-bold leading-relaxed">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="uppercase tracking-label">
                    {isMyth ? t('tags.myths.myth', 'Myth') : t('tags.myths.fact', 'Fact')}
                    {': '}
                  </span>
                  {row.claim}
                </span>
              </p>
              <p className="mt-2 pl-6 text-13 leading-relaxed text-muted-foreground">
                {isMyth && (
                  <span className="font-bold text-foreground">
                    {t('tags.myths.factLabel', 'Fact')}
                    {': '}
                  </span>
                )}
                {row.truth}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-2xs uppercase tracking-label text-muted-foreground">
        {t('tags.myths.credit', 'Factual grounding')}{' '}
        <a href={attribution.source_url} target="_blank" rel="noopener noreferrer">
          {attribution.source}
        </a>
      </p>
    </section>
  );
}
