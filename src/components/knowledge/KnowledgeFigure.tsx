import { KnowledgeDiagram } from './KnowledgeDiagram';
import { useId, useState } from 'react';
import { pilotFigure } from '@/components/tags/infographics/registry';
import type { PilotFigure } from '@/lib/knowledge/pilotFigures';
import { usePublicKnowledgeEditorial } from '@/hooks/knowledge/useKnowledgeEditorial';
import type { KnowledgeKind } from '@/lib/knowledge/editorial';

/** Crisp vector geometry. The same rows drive the drawing and its text equivalent. */
export function KnowledgeFigure({
  figure,
  draft = false,
}: {
  figure: PilotFigure;
  draft?: boolean;
}) {
  const id = useId();
  const [tableOpen, setTableOpen] = useState(false);
  return (
    <figure
      className="my-8 border border-border-hairline bg-background"
      aria-labelledby={`${id}-title`}
      lang="en"
    >
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <h3 id={`${id}-title`} className="text-headline font-bold">
          {figure.title}
        </h3>
        <p className="mt-4 max-w-reading text-13 leading-relaxed">{figure.caption}</p>
        {draft && <p className="mt-2 text-13 font-bold">Draft figure · editorial review pending</p>}
      </div>
      <div
        className="hidden px-4 py-6 sm:block md:px-6"
        role="img"
        aria-label={figure.summary}
        aria-describedby={`${id}-text`}
      >
        <KnowledgeDiagram figure={figure} />
      </div>
      <div className="border-t border-border-hairline px-6 py-4 md:px-8">
        <button
          type="button"
          aria-expanded={tableOpen}
          aria-controls={`${id}-text`}
          onClick={() => setTableOpen(!tableOpen)}
          className="min-h-11 underline underline-offset-4"
        >
          {tableOpen ? 'Hide text version' : 'Read as text'}
        </button>
        <dl id={`${id}-text`} className={tableOpen ? 'mt-4 space-y-4' : 'space-y-4 sm:sr-only'}>
          {figure.rows.map(([label, detail]) => (
            <div key={label}>
              <dt className="font-bold">{label}</dt>
              <dd className="mt-1 text-13">{detail}</dd>
            </div>
          ))}
        </dl>
        <figcaption className="mt-4 text-13 leading-relaxed">
          Sources:{' '}
          {figure.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 && ' · '}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {source.title}
              </a>
            </span>
          ))}
        </figcaption>
      </div>
    </figure>
  );
}
export function KnowledgeVisuals({ kind, entityId }: { kind: KnowledgeKind; entityId: string }) {
  const { data } = usePublicKnowledgeEditorial(kind, [entityId]);
  const ids = data?.find((row) => row.entity_id === entityId)?.visual_ids ?? [];
  return (
    <>
      {ids.slice(0, 2).map((id) => {
        const figure = pilotFigure(id);
        return figure ? <KnowledgeFigure key={id} figure={figure} /> : null;
      })}
    </>
  );
}
