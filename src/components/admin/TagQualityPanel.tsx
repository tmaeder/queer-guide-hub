import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gauge } from 'lucide-react';
import { useTagQualityScorecard } from '@/hooks/useTagQualityScorecard';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

const ISSUE_LABELS: Record<string, string> = {
  article_missing_description: 'Articles missing canonical summary',
  article_missing_category: 'Articles missing primary category',
  article_unreviewed: 'Articles awaiting prose review',
  published_high_risk_missing_source: 'Published high-risk articles missing source',
  ontology_pending: 'Articles awaiting ontology decision',
  localisation_pending: 'Articles awaiting localisation decision',
  utility_indexable: 'Utility tags published as articles',
  redirect_indexable: 'Redirect tags published as articles',
  redirect_missing_target: 'Entity redirects missing canonical target',
  place_like_facets_without_target: 'Place-like facets needing entity review',
  restoration_review_pending: 'Restored tags awaiting disposition',
};

function completion(done: number, total: number) {
  return total ? `${done}/${total}` : '0/0';
}

/**
 * Role-aware glossary governance. Usage determines queue order, never quality;
 * embeddings and a per-tag image quota are deliberately absent.
 */
export function TagQualityPanel() {
  const { data } = useTagQualityScorecard();
  if (!data) return null;
  const issueRows = Object.entries(data.issues).sort(([, a], [, b]) => b - a);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Gauge size={16} />
          Glossary quality by publication role
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.oldest_unresolved_at && (
          <p className="text-13 text-muted-foreground">
            Oldest unresolved entry:{' '}
            <span className="font-medium text-foreground">
              {new Date(data.oldest_unresolved_at).toLocaleDateString()}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <AdminStat label="Articles" value={data.roles.article} />
          <AdminStat label="Published articles" value={data.article.published} />
          <AdminStat label="Utility vocabulary" value={data.roles.utility} />
          <AdminStat label="Entity redirects" value={data.roles.entity_redirect} />
          <AdminStat
            label="Redirect targets verified"
            value={completion(data.redirect.valid_target, data.redirect.total)}
            hardFail={data.redirect.valid_target !== data.redirect.total}
          />
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Article decisions completed</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Definition', data.article.definition_complete],
              ['Primary category', data.article.category_complete],
              ['Prose review', data.article.review_complete],
              ['Source decision', data.article.source_decision_complete],
              ['Ontology decision', data.article.ontology_complete],
              ['Localisation decision', data.article.localisation_decision_complete],
            ].map(([label, done]) => (
              <div key={String(label)} className="rounded-element bg-muted/40 px-4 py-2">
                <div className="text-body-lg tabular-nums">
                  {completion(Number(done), data.article.total)}
                </div>
                <div className="text-13 text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Top 500 published articles</div>
          <div className="flex flex-wrap gap-2">
            {[
              ['Definition', data.top500.definition_complete],
              ['Category', data.top500.category_complete],
              ['Prose review', data.top500.review_complete],
              ['Source decision', data.top500.source_decision_complete],
              ['Ontology', data.top500.ontology_complete],
              ['Localisation', data.top500.localisation_decision_complete],
            ].map(([label, done]) => (
              <AdminStat
                key={String(label)}
                label={String(label)}
                value={completion(Number(done), data.top500.total)}
                hardFail={Number(done) !== data.top500.total}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Open editorial issues</div>
          <div className="flex flex-wrap gap-2">
            {issueRows.map(([key, count]) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-element bg-muted/40 px-4 py-2"
              >
                <span className="text-body-lg tabular-nums">{count}</span>
                <span className="text-13 text-muted-foreground">{ISSUE_LABELS[key] ?? key}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Localised article summaries</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.localisation).map(([language, count]) => (
              <div key={language} className="rounded-element bg-muted/40 px-4 py-2 text-13">
                <span className="font-medium uppercase">{language.replace('_reviewed', '')}</span>{' '}
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Category hotspots</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.categories.slice(0, 8).map((row) => (
              <div key={row.category} className="rounded-element bg-muted/40 px-4 py-2">
                <div className="font-medium">{row.category}</div>
                <div className="text-13 tabular-nums text-muted-foreground">
                  {row.missing_description} missing · {row.weak_definition} weak ·{' '}
                  {row.sensitive_unreviewed} sensitive unreviewed
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
