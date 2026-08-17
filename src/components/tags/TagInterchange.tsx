/**
 * TagInterchange — the governed ontology, drawn as a line with an interchange.
 *
 * This is the most subway-native thing on a tag page, so it gets a full-width
 * band rather than the 240px sidebar box it used to live in.
 *
 * The semantics are the diagram's, not decoration:
 *
 *   broader  → StationRing state="done"  — stops you came through
 *   this tag → the filled `#` RouteBullet — where you are
 *   narrower → StationRing state="open"  — stops still ahead
 *   related  → interchange chips          — change here for another line
 *
 * Only the CURATED ontology (`get_tag_ontology` over `tag_relations`) appears
 * here. The computed similarity pool (`get_similar_tags`) renders in the
 * end-of-line panel instead, so the page distinguishes "an editor said these
 * are connected" from "an embedding thinks these are close" structurally
 * rather than with a caption nobody reads.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { StationRing } from '@/components/transit/StationRing';
import { useTagOntology, type OntologyTag } from '@/hooks/useTagRelationships';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { isAdultTag } from '@/components/resources/categoryMeta';

function LineStop({ tag, state }: { tag: OntologyTag; state: 'done' | 'open' }) {
  return (
    <li className="relative flex items-center gap-2 py-1.5">
      <span className="flex w-4 shrink-0 justify-center">
        <StationRing state={state} />
      </span>
      <LocalizedLink
        to={`/tags/${encodeURIComponent(tag.slug)}`}
        className="min-w-0 flex-1 truncate px-2 py-0.5 text-13 leading-snug text-muted-foreground no-underline transition-colors hover:bg-surface-container hover:text-foreground"
      >
        {tag.name}
      </LocalizedLink>
    </li>
  );
}

export function TagInterchange({ tagId, tagName }: { tagId: string; tagName: string }) {
  const { t } = useTranslation();
  const { data: ontology } = useTagOntology(tagId);
  const { enabled: safeEnabled } = useSafeMode();

  const { broader, narrower, related } = useMemo(() => {
    const clean = (list: OntologyTag[] | undefined) =>
      (list ?? []).filter((tag) => !safeEnabled || !isAdultTag(tag));
    return {
      broader: clean(ontology?.broader),
      narrower: clean(ontology?.narrower),
      related: clean(ontology?.related),
    };
  }, [ontology, safeEnabled]);

  if (!broader.length && !narrower.length && !related.length) return null;

  return (
    <section
      id="taxonomy"
      aria-labelledby="taxonomy-heading"
      className="border-y border-border-hairline py-8"
    >
      <Eyebrow as="p">{t('tags.detail.interchangeEyebrow', 'Interchange')}</Eyebrow>
      <h2
        id="taxonomy-heading"
        className="mt-2 font-display text-headline leading-tight md:text-display"
      >
        {t('tags.detail.interchangeTitle', 'In the taxonomy')}
      </h2>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <ol className="relative m-0 list-none p-0">
          {/* The line behind the stops, inset so it terminates at the first and
              last ring rather than implying more stops off the ends. */}
          <span aria-hidden className="absolute bottom-3 left-0 top-3 flex w-4 justify-center">
            <span className="h-full w-[3px] bg-track-pink" />
          </span>
          {broader.map((tag) => (
            <LineStop key={tag.id} tag={tag} state="done" />
          ))}
          <li className="relative flex items-center gap-2 py-1.5">
            <span className="flex w-4 shrink-0 justify-center">
              <RouteBullet type="tag" size={30} className="-ml-[7px]" />
            </span>
            <span className="min-w-0 flex-1 truncate px-2 text-title font-bold">{tagName}</span>
          </li>
          {narrower.map((tag) => (
            <LineStop key={tag.id} tag={tag} state="open" />
          ))}
        </ol>

        {related.length > 0 && (
          <div>
            <Eyebrow as="p">{t('tags.detail.changeHereFor', 'Change here for')}</Eyebrow>
            <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
              {related.map((tag) => (
                <li key={tag.id}>
                  <LocalizedLink
                    to={`/tags/${encodeURIComponent(tag.slug)}`}
                    className={cn(
                      'inline-flex items-center gap-2 bg-muted rounded-element px-2 py-1 text-13 font-bold no-underline transition-colors',
                      'hover:bg-foreground hover:text-background',
                    )}
                  >
                    <RouteBullet type="tag" size={20} />
                    {tag.name}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
