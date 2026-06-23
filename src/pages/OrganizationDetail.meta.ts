import type { EntityMeta } from '@/components/entity/entityDescriptor';
import { socialSameAs } from '@/lib/social/registry';
import type { Organization } from '@/hooks/useOrganization';

/**
 * Build SEO meta + Organization JSON-LD for the org detail page. Extracted from
 * the former inline `useMeta(...)` block so the org adapter has a symmetric meta
 * source (mirrors `VenueDetail.meta.ts`).
 */
export function buildOrgMeta(org: Organization): EntityMeta {
  const sameAs = socialSameAs(org.social);
  return {
    title: `${org.name} — Queer Guide`,
    description: org.editorial_hook || org.description || `${org.name} on Queer Guide.`,
    canonicalPath: `/organizations/${org.slug}`,
    ogImage: org.cover_image_url || org.logo_url || org.images?.[0] || undefined,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: org.name,
      url: org.website || `https://queer.guide/organizations/${org.slug}`,
      ...(org.description ? { description: org.description } : {}),
      ...(org.logo_url ? { logo: org.logo_url } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    },
  };
}
