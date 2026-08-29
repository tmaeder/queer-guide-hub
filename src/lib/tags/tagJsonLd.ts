import type { TagLegalSourceRow } from '@/hooks/usePageFetchers';

/**
 * The `DefinedTerm` node for a glossary page.
 *
 * Extracted out of TagDetail's `meta` useMemo purely so it can be unit-tested —
 * the citation shape is easy to get subtly wrong and impossible to assert on
 * inside a memo.
 */

export interface TagJsonLdInput {
  name: string;
  slug: string;
  description: string;
  wikipedia_url?: string | null;
}

export function buildTagJsonLd(
  tag: TagJsonLdInput,
  /**
   * Every PUBLISHED source row for the tag, legal and clinical alike. Named
   * `sources` rather than `legalSources` since 20261013110300 added clinical
   * guidance: the node type is chosen per row below, so passing only the legal
   * half would silently drop the citation from every health tag.
   */
  sources: TagLegalSourceRow[] = [],
): Record<string, unknown> {
  const legalSources = sources;
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: tag.name,
    description: tag.description,
    url: `https://queer.guide/tags/${tag.slug}`,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: 'Queer Guide Glossary',
      url: 'https://queer.guide/tags',
    },
  };

  const cited = legalSources.filter((s) => s.official_title && s.source_url);

  // `sameAs` stays a bare string when Wikipedia is the only external identity, so
  // nothing changes for the ~2,500 tags that carry no citation.
  const sameAs = [tag.wikipedia_url, ...cited.map((s) => s.source_url)].filter((u): u is string =>
    Boolean(u),
  );
  if (sameAs.length === 1) jsonLd.sameAs = sameAs[0];
  else if (sameAs.length > 1) jsonLd.sameAs = sameAs;

  if (cited.length > 0) {
    jsonLd.citation = cited.map((s) => {
      // Clinical guidance is not law and must not be emitted as `Legislation` —
      // that would assert to a consumer that the UCSF trans care guidelines are a
      // legal instrument. Plain `CreativeWork` is the honest node: it is a
      // published document, nothing more.
      if (s.source_type === 'clinical_guideline') {
        return {
          '@type': 'CreativeWork',
          name: s.official_title,
          url: s.source_url,
        };
        // No `datePublished`, for the same reason `legislationDate` is omitted
        // below: schema.org types it as a Date and we hold only a year.
      }
      const node: Record<string, unknown> = {
        '@type': 'Legislation',
        name: s.official_title,
        url: s.source_url,
      };
      if (s.jurisdiction) node.legislationJurisdiction = s.jurisdiction;
      // Deliberately NO legislationDate: schema.org types it as a Date and we hold
      // only a year, so emitting "1988" would assert a precision we do not have.
      return node;
    });
  }

  // Nothing is emitted for a class-of-law tag (marriage-equality, decriminalization).
  // A class of law is not a `Legislation` node, and pointing `citation` at our own
  // /rights page would dress an internal link up as a primary legal source.
  return jsonLd;
}
