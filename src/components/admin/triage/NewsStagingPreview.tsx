/**
 * NewsStagingPreview — the human-decision view for a news `ingestion_staging`
 * row. Shows the article as a reader would see it, the LLM verdict, and why
 * the publish gate sent it here — each gate reason explained from
 * `pipeline_explanations` (`news-gate:*` / `news-review:*`). An unregistered
 * reason renders as the raw key in monospace, never prettified.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RenderedContent } from '@/components/cms/fields/RenderedContent';
import { SeverityChip } from '@/components/admin/audit/PipelineInspector';
import { useExplanations } from '@/hooks/useExplanations';
import {
  NEWS_VERDICT_LABEL,
  newsGateKey,
  newsReviewKey,
  type NewsStagingView,
} from '@/lib/newsStaging';

interface NewsStagingPreviewProps {
  news: NewsStagingView;
  /** The generic field editor, kept reachable for corrections but collapsed. */
  editor?: ReactNode;
}

const pct = (v: number | undefined) =>
  typeof v === 'number' ? `${Math.round(v <= 1 ? v * 100 : v)}%` : '—';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-4 space-y-2">
      <h3 className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ReasonRow({
  explanationKey,
  explanation,
}: {
  explanationKey: string;
  explanation?: { title: string; body: string; what_now: string | null; severity: string };
}) {
  if (!explanation) {
    return (
      <li className="py-2 text-13 flex flex-wrap items-center gap-1.5">
        <code className="bg-muted px-1 rounded-badge">{explanationKey}</code>
        <Badge variant="outline">unexplained</Badge>
      </li>
    );
  }
  return (
    <li className="py-2 border-b border-border-hairline last:border-b-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-13 font-semibold">{explanation.title}</span>
        <SeverityChip severity={explanation.severity} />
      </div>
      <p className="text-13 text-muted-foreground mt-0.5">{explanation.body}</p>
      {explanation.what_now && (
        <p className="text-13 mt-1">
          <span className="font-semibold">What to check: </span>
          {explanation.what_now}
        </p>
      )}
    </li>
  );
}

function NameList({ label, names }: { label: string; names?: string[] }) {
  if (!names?.length) return null;
  return (
    <p className="text-13">
      <span className="text-muted-foreground">{label}: </span>
      {names.join(', ')}
    </p>
  );
}

export function NewsStagingPreview({ news, editor }: NewsStagingPreviewProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const d = news.decision;
  const keys = [
    ...news.blockedReasons.map(newsGateKey),
    ...(news.reviewReason ? [newsReviewKey(news.reviewReason)] : []),
  ];
  const { data: explanations } = useExplanations(keys);
  const img = d?.imageAssessment;

  const host = (() => {
    try {
      return news.url ? new URL(news.url).hostname.replace(/^www\./, '') : null;
    } catch {
      return null;
    }
  })();

  return (
    <div>
      {/* The article as a reader would see it */}
      <article className="px-4 py-4 space-y-2">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
          {news.publication ?? 'Unknown publication'}
          {news.publishedAt &&
            ` · ${new Date(news.publishedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}`}
        </p>
        <h2 className="text-title font-bold leading-snug">{news.headline ?? 'Untitled'}</h2>
        {news.url && (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Original on {host ?? 'source'}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {news.image && !imageBroken && (
          <figure className="space-y-1">
            <img
              src={news.image}
              alt=""
              loading="lazy"
              className="max-h-56 w-full rounded-element object-cover"
              onError={() => setImageBroken(true)}
            />
            {img && (
              <figcaption className="text-2xs text-muted-foreground">
                Image {img.isUsable === false ? 'not usable' : 'usable'}
                {img.reason ? ` — ${img.reason}` : ''}
              </figcaption>
            )}
          </figure>
        )}
        {(!news.image || imageBroken) && img && (
          <p className="text-2xs text-muted-foreground">
            No image shown. Assessment: {img.isUsable === false ? 'not usable' : 'usable'}
            {img.reason ? ` — ${img.reason}` : ''}
          </p>
        )}
        {news.excerpt && <p className="text-15 font-medium">{news.excerpt}</p>}
        {news.body ? (
          <div className="max-h-96 overflow-y-auto">
            <RenderedContent value={news.body} />
          </div>
        ) : (
          <p className="text-13 text-muted-foreground">No article body was extracted.</p>
        )}
      </article>

      {/* LLM verdict */}
      <Section title="Verdict">
        {d ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={news.verdict === 'publish' ? 'default' : 'outline'}>
                {NEWS_VERDICT_LABEL[news.verdict]}
              </Badge>
              {d.isSatire && <Badge variant="outline">Satire</Badge>}
              {d.isAdvertorial && <Badge variant="outline">Advertorial</Badge>}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-13">
              <div>
                <dt className="text-2xs text-muted-foreground">Confidence</dt>
                <dd className="tabular-nums">{pct(d.confidence)}</dd>
              </div>
              <div>
                <dt className="text-2xs text-muted-foreground">Relevance</dt>
                <dd className="tabular-nums">{pct(d.relevanceScore)}</dd>
              </div>
              <div>
                <dt className="text-2xs text-muted-foreground">LGBTQ+ relevance</dt>
                <dd className="tabular-nums">{pct(news.lgbtqRelevance)}</dd>
              </div>
            </dl>
            {d.rationale && <p className="text-13">{d.rationale}</p>}
            {d.warnings && d.warnings.length > 0 && (
              <ul className="list-disc pl-4 text-13 text-muted-foreground">
                {d.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-13 text-muted-foreground">
            Verdict pending: the quality check has not judged this article, so nothing below was
            decided by a model.
          </p>
        )}
      </Section>

      {/* Why the gate sent it to a human */}
      <Section title="Why it is here">
        {keys.length === 0 ? (
          <p className="text-13 text-muted-foreground">No gate reason was recorded.</p>
        ) : (
          <ul>
            {keys.map((key) => (
              <ReasonRow key={key} explanationKey={key} explanation={explanations?.get(key)} />
            ))}
          </ul>
        )}
      </Section>

      {[d?.linkedCities, d?.linkedCountries, d?.linkedPersonalities, d?.linkedOrganisations].some(
        (names) => (names?.length ?? 0) > 0,
      ) && (
        <Section title="Linked">
          <NameList label="Cities" names={d?.linkedCities} />
          <NameList label="Countries" names={d?.linkedCountries} />
          <NameList label="People" names={d?.linkedPersonalities} />
          <NameList label="Organisations" names={d?.linkedOrganisations} />
        </Section>
      )}

      {editor && (
        <Collapsible open={editOpen} onOpenChange={setEditOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-border px-4 py-2 text-2xs font-medium text-muted-foreground">
            Correct fields
            <ChevronDown
              className={`h-3 w-3 transition-transform ${editOpen ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>{editor}</CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
