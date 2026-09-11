import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { SectionDef } from '@/components/entity/editorial';
import {
  useStyleguide,
  SECTION_LABELS,
  SECTION_ORDER,
  CATEGORY_LABELS,
  SCENARIO_LABELS,
  type StyleguideRule,
  type StyleguideTerm,
  type TermCategory,
} from '@/hooks/useStyleguide';

/**
 * `/styleguide` — the editorial standard, as a page anyone can read.
 *
 * Same rows the enrichment pipelines get compiled into a system prompt. That is
 * the point of publishing it: a contributor who reads this page and a model
 * that receives the prompt are being told the same thing, and when an editor
 * changes a rule both change together.
 *
 * Motion is left on (this is not a crisis-adjacent surface), but the copy rules
 * on this page are the ones it is documenting, so it keeps its own advice: no
 * marketing vocabulary, no padded intros, and the terminology table says why
 * rather than only what.
 *
 * Static second segment, per the routing rule in src/routes.tsx.
 */

const SEVERITY_LABEL: Record<string, string> = {
  must: 'Must',
  should: 'Should',
  never: 'Never',
  avoid: 'Avoid',
  context: 'Depends',
};

function RuleCard({ rule }: { rule: StyleguideRule }) {
  return (
    <Card className="mb-4">
      <CardContent className="pt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={rule.severity === 'never' ? 'destructive' : 'outline'}>
            {SEVERITY_LABEL[rule.severity] ?? rule.severity}
          </Badge>
          <h3 className="text-title font-bold">{rule.title}</h3>
        </div>
        <p className="max-w-prose whitespace-pre-line">{rule.body}</p>
        {rule.rationale ? (
          <p className="mt-4 max-w-prose text-13 text-muted-foreground">
            <span className="font-bold">Why:</span> {rule.rationale}
          </p>
        ) : null}
        {!rule.applies_to.includes('all') ? (
          <p className="mt-2 text-2xs uppercase tracking-wider text-muted-foreground">
            Applies to: {rule.applies_to.join(', ')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TermRow({ term }: { term: StyleguideTerm }) {
  return (
    <div className="border-b border-border-hairline py-4 last:border-b-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <Badge variant={term.severity === 'never' ? 'destructive' : 'outline'}>
          {SEVERITY_LABEL[term.severity] ?? term.severity}
        </Badge>
        <span className="text-muted-foreground line-through">{term.avoid.join(', ')}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          &rarr;
        </span>
        <span className="font-bold">
          {term.preferred ?? 'no drop-in replacement — rewrite the sentence'}
        </span>
      </div>
      {term.rationale ? <p className="max-w-prose text-13">{term.rationale}</p> : null}
      {term.context_note ? (
        <p className="mt-2 max-w-prose text-13 text-muted-foreground">{term.context_note}</p>
      ) : null}
    </div>
  );
}

export default function Styleguide() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useStyleguide();

  useMeta({
    title: t('styleguide.metaTitle', 'Editorial styleguide and tone of voice'),
    description: t(
      'styleguide.metaDescription',
      'How queer.guide writes: the voice rules, the terminology we use and avoid, and the reasons for both. The same standard our automated content pipelines are given.',
    ),
    canonicalPath: '/styleguide',
  });

  const termsByCategory = useMemo(() => {
    const grouped = new Map<TermCategory, StyleguideTerm[]>();
    for (const term of data?.terms ?? []) {
      const list = grouped.get(term.category) ?? [];
      list.push(term);
      grouped.set(term.category, list);
    }
    return grouped;
  }, [data?.terms]);

  const sections: SectionDef[] = useMemo(() => {
    const ruleSections: SectionDef[] = SECTION_ORDER.filter((section) =>
      (data?.rules ?? []).some((r) => r.section === section),
    ).map((section) => ({
      id: section.replace(/_/g, '-'),
      label: SECTION_LABELS[section],
      content: (
        <div>
          {(data?.rules ?? [])
            .filter((r) => r.section === section)
            .map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
        </div>
      ),
    }));

    const out = [...ruleSections];

    if (termsByCategory.size > 0) {
      out.push({
        id: 'terminology',
        label: t('styleguide.section.terminology', 'Terminology'),
        content: (
          <div>
            <p className="mb-6 max-w-prose">
              {t(
                'styleguide.terminologyLede',
                'Struck-through on the left is what we do not write. Bold on the right is what we write instead. The reason matters more than the rule: an editor who knows why a word is wrong can handle the word this table has not reached yet.',
              )}
            </p>
            {[...termsByCategory.entries()].map(([category, terms]) => (
              <section key={category} className="mb-8">
                <h3 className="mb-2 text-title font-bold">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                {terms.map((term) => (
                  <TermRow key={term.id} term={term} />
                ))}
              </section>
            ))}
          </div>
        ),
      });
    }

    if ((data?.examples ?? []).length > 0) {
      out.push({
        id: 'examples',
        label: t('styleguide.section.examples', 'Worked examples'),
        content: (
          <div className="space-y-8">
            {(data?.examples ?? []).map((example) => (
              <article key={example.id}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{SCENARIO_LABELS[example.scenario]}</Badge>
                  <h3 className="text-title font-bold">{example.title}</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">
                        {t('styleguide.before', 'Before')}
                      </p>
                      <p className="whitespace-pre-line text-13 text-muted-foreground">
                        {example.before_text}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <p className="mb-2 text-2xs uppercase tracking-wider text-muted-foreground">
                        {t('styleguide.after', 'After')}
                      </p>
                      <p className="whitespace-pre-line text-13">{example.after_text}</p>
                    </CardContent>
                  </Card>
                </div>
                {example.note ? (
                  <p className="mt-4 max-w-prose text-13 text-muted-foreground">{example.note}</p>
                ) : null}
              </article>
            ))}
          </div>
        ),
      });
    }

    out.push({
      id: 'machine',
      label: t('styleguide.section.machine', 'For machines'),
      content: (
        <div className="max-w-prose space-y-4">
          <p>
            {t(
              'styleguide.machine.intro',
              'Everything above is compiled into a versioned system prompt and handed to every automated writing and enrichment job on this platform. It is published, not internal — if you build on our data, you can read exactly what our pipelines were told.',
            )}
          </p>
          <pre className="overflow-x-auto rounded-element bg-muted p-4 text-13">
            <code>GET https://queer.guide/api/v1/styleguide/prompt</code>
          </pre>
          <p className="text-13 text-muted-foreground">
            {t(
              'styleguide.machine.params',
              'format=text|json · profile=full|core|compact · v=1.0.0 pins a version. Versions are immutable, so a pinned request returns the same text forever.',
            )}
          </p>
          <p className="text-13 text-muted-foreground">
            {t(
              'styleguide.machine.semver',
              'Patch releases change wording. Minor releases add or relax a rule. Major releases reverse one, which is the only case where output validated against an earlier version needs re-checking.',
            )}
          </p>
        </div>
      ),
    });

    return out;
  }, [data, termsByCategory, t]);

  const version = data?.version?.version;

  return (
    <IntentPageLayout
      breadcrumbLabel={t('styleguide.breadcrumb', 'Styleguide')}
      breadcrumbHref="/styleguide"
      eyebrow={
        version
          ? t('styleguide.eyebrow', 'Editorial standard v{{version}}', { version })
          : t('styleguide.eyebrowUnpublished', 'Editorial standard')
      }
      title={t('styleguide.title', 'How we write')}
      lede={t(
        'styleguide.lede',
        'The voice rules, the words we use and the words we do not, and the reasoning behind both. Community editors maintain this page, and the same rules are compiled into the instructions our automated content pipelines run on.',
      )}
      sections={sections}
      loading={isLoading}
      error={(error as Error) ?? null}
    />
  );
}
