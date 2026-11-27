import { KnowledgeVisuals } from './KnowledgeFigure';
import { usePublicKnowledgeEditorial } from '@/hooks/knowledge/useKnowledgeEditorial';
import type { KnowledgeKind } from '@/lib/knowledge/editorial';

export function KnowledgeReferences({ kind, entityId }: { kind: KnowledgeKind; entityId: string }) {
  const { data } = usePublicKnowledgeEditorial(kind, [entityId]);
  const editorial = data?.find((row) => row.entity_id === entityId);
  if (!editorial?.sources.length) return null;
  return (
    <>
      <KnowledgeVisuals kind={kind} entityId={entityId} />
      <section
        aria-label="Sources and further reading"
        className="mt-8 border-t border-border-hairline pt-6"
        lang="en"
      >
        <h2 className="text-title font-bold">Sources and further reading</h2>
        {editorial.portrait && (
          <p className="mt-4 text-13">
            Portrait: {editorial.portrait.attribution}.{' '}
            <a
              className="underline underline-offset-4"
              href={editorial.portrait.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Image source
            </a>
            {editorial.portrait.license_url && (
              <>
                {' '}
                ·{' '}
                <a
                  className="underline underline-offset-4"
                  href={editorial.portrait.license_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {editorial.portrait.license}
                </a>
              </>
            )}
          </p>
        )}
        <ul className="mt-4 space-y-4">
          {editorial.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {source.title}
              </a>
              <span className="ml-2 text-13 text-muted-foreground">{source.publisher}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
