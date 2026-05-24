import { useParams } from 'react-router';
import { useMeta } from '@/hooks/useMeta';
import { useMarketplaceGuide, type GuidePickWithListing } from '@/hooks/useMarketplaceGuide';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { ArrowLeft, Check, X, ExternalLink, Clock, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import type { Database } from '@/integrations/supabase/types';

type PickTier = Database['public']['Tables']['marketplace_guide_picks']['Row']['tier'];

const TIER_LABEL: Record<PickTier, string> = {
  top: 'Our pick',
  also_great: 'Also great',
  upgrade: 'Upgrade pick',
  budget: 'Budget pick',
  avoid: 'Skip this one',
};

function formatPickPrice(listing: GuidePickWithListing['listing']): string | null {
  if (!listing?.price) return null;
  const cur = listing.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(
      Number(listing.price),
    );
  } catch {
    return `${cur} ${listing.price}`;
  }
}

function getOutboundUrl(listing: GuidePickWithListing['listing']): string | null {
  if (!listing) return null;
  return listing.affiliate_url ?? listing.external_url ?? null;
}

function PickBlock({ pick, index }: { pick: GuidePickWithListing; index: number }) {
  const listing = pick.listing;
  const heroImage = listing?.images?.[0] ?? null;
  const heroUrl = resolveImageUrl(heroImage);
  const price = formatPickPrice(listing);
  const outbound = getOutboundUrl(listing);
  const unavailable = listing?.availability === 'out_of_stock';

  return (
    <article
      id={`pick-${index + 1}`}
      className="grid grid-cols-12 gap-6 md:gap-10 border-t border-border pt-12 first:border-t-0 first:pt-0"
    >
      <div className="col-span-12 md:col-span-5">
        <div className="md:sticky md:top-24 space-y-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-container bg-muted">
            {heroUrl ? (
              <img
                src={heroUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            {unavailable && (
              <div className="absolute inset-x-0 bottom-0 bg-foreground/80 text-background text-13 text-center py-2">
                No longer available
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-12 md:col-span-7 space-y-5">
        <p className="inline-flex items-center rounded-badge border border-border px-2 py-1 text-13 uppercase tracking-[0.15em]">
          {TIER_LABEL[pick.tier]}
        </p>
        <h3 className="text-display leading-tight">
          {listing ? (
            <LocalizedLink
              to={`/marketplace/${listing.slug ?? listing.id}`}
              className="no-underline hover:underline underline-offset-4"
            >
              {listing.title}
            </LocalizedLink>
          ) : (
            pick.rationale_md?.split('\n')[0] ?? 'Pick'
          )}
        </h3>
        {listing?.business_name && (
          <p className="text-13 uppercase tracking-[0.1em] text-muted-foreground">
            {listing.business_name}
          </p>
        )}
        {pick.rationale_md && (
          <p className="text-body-lg leading-relaxed">{pick.rationale_md}</p>
        )}

        {(pick.pros.length > 0 || pick.cons.length > 0) && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-15">
            {pick.pros.length > 0 && (
              <div>
                <dt className="text-13 uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Pros
                </dt>
                <dd>
                  <ul className="space-y-2">
                    {pick.pros.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <Check size={16} className="mt-1 shrink-0" aria-hidden />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {pick.cons.length > 0 && (
              <div>
                <dt className="text-13 uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Cons
                </dt>
                <dd>
                  <ul className="space-y-2">
                    {pick.cons.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <X size={16} className="mt-1 shrink-0" aria-hidden />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          {price && (
            <span className="text-title font-mono">{price}</span>
          )}
          {outbound && !unavailable && (
            <Button asChild>
              <a
                href={outbound}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
              >
                Shop now
                <ExternalLink size={14} aria-hidden />
              </a>
            </Button>
          )}
          {listing && (
            <LocalizedLink
              to={`/marketplace/${listing.slug ?? listing.id}`}
              className="text-13 text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              See full listing
            </LocalizedLink>
          )}
        </div>
      </div>
    </article>
  );
}

function ComparisonTable({ picks }: { picks: GuidePickWithListing[] }) {
  const visible = picks.filter((p) => p.tier !== 'avoid' && p.listing);
  if (visible.length < 2) return null;
  return (
    <section className="mt-16">
      <h2 className="text-display mb-6">At a glance</h2>
      <div className="overflow-x-auto rounded-element border border-border">
        <table className="w-full text-15">
          <thead>
            <tr className="bg-muted">
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                Tier
              </th>
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                Pick
              </th>
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                Price
              </th>
              <th className="text-left p-4 text-13 uppercase tracking-[0.1em] text-muted-foreground">
                Best for
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((pick, i) => (
              <tr key={pick.id} className={i % 2 === 1 ? 'bg-muted/50' : ''}>
                <td className="p-4 align-top text-13 uppercase tracking-[0.1em]">
                  {TIER_LABEL[pick.tier]}
                </td>
                <td className="p-4 align-top">
                  <div className="font-medium">{pick.listing?.title}</div>
                  {pick.listing?.business_name && (
                    <div className="text-13 text-muted-foreground">
                      {pick.listing.business_name}
                    </div>
                  )}
                </td>
                <td className="p-4 align-top font-mono">
                  {formatPickPrice(pick.listing) ?? '—'}
                </td>
                <td className="p-4 align-top text-13 text-muted-foreground">
                  {pick.pros[0] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const MarketplaceGuide = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const { data, isLoading, error } = useMarketplaceGuide(slug);

  useMeta({
    title: data?.guide?.title ?? 'Guide',
    description: data?.guide?.dek ?? undefined,
    canonicalPath: slug ? `/marketplace/guides/${slug}` : undefined,
    ogType: 'article',
    jsonLd: data?.guide
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: data.guide.title,
          description: data.guide.dek ?? undefined,
          datePublished: data.guide.published_at ?? undefined,
          dateModified: data.guide.updated_at,
          author: { '@type': 'Organization', name: 'Queer Guide' },
        }
      : undefined,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-12 px-4">
        <div className="h-3 w-32 bg-muted animate-pulse rounded-badge mb-6" />
        <div className="h-12 w-3/4 bg-muted animate-pulse rounded-element mb-4" />
        <div className="h-6 w-2/3 bg-muted animate-pulse rounded-element" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto py-16 px-4">
        <EmptyState
          icon={BookOpen}
          title="Guide not found."
          description="It may have been moved or unpublished."
          primaryAction={{
            label: 'Browse all guides',
            onClick: () => navigate('/marketplace/guides'),
          }}
        />
      </div>
    );
  }

  const { guide, picks } = data;
  const hero = resolveImageUrl(guide.hero_image_path);

  return (
    <article className="min-h-screen">
      <header className="container mx-auto px-4 pt-8 pb-12 max-w-4xl">
        <LocalizedLink
          to="/marketplace/guides"
          className="inline-flex items-center gap-2 text-13 text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft size={14} aria-hidden />
          All guides
        </LocalizedLink>

        <p className="text-xs2 uppercase tracking-[0.2em] text-muted-foreground mb-4">
          Guide
          {guide.category_slug ? ` · ${guide.category_slug}` : ''}
          {guide.reading_time_min ? ` · ${guide.reading_time_min} min read` : ''}
          {' · '}
          {guide.pick_count} picks
        </p>
        <h1 className="text-hero leading-[1.05] mb-6">{guide.title}</h1>
        {guide.dek && (
          <p className="italic text-body-lg text-muted-foreground max-w-2xl">
            {guide.dek}
          </p>
        )}
      </header>

      {hero && (
        <div className="container mx-auto px-4 max-w-5xl mb-12">
          <div className="relative aspect-[16/9] rounded-container overflow-hidden bg-muted">
            <img
              src={hero}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          </div>
        </div>
      )}

      {guide.intro_md && (
        <section className="container mx-auto px-4 max-w-3xl mb-16 space-y-5">
          {guide.intro_md.split(/\n\n+/).map((para, i) => (
            <p key={i} className="text-body-lg leading-relaxed">
              {para}
            </p>
          ))}
        </section>
      )}

      <section className="container mx-auto px-4 max-w-5xl space-y-16">
        {picks.map((pick, i) => (
          <PickBlock key={pick.id} pick={pick} index={i} />
        ))}
      </section>

      <div className="container mx-auto px-4 max-w-5xl">
        <ComparisonTable picks={picks} />
      </div>

      <footer className="container mx-auto px-4 max-w-3xl my-16 pt-8 border-t border-border">
        <p className="inline-flex items-center gap-2 text-13 text-muted-foreground">
          <Clock size={14} aria-hidden />
          Last updated{' '}
          {new Date(guide.updated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <div className="mt-6">
          <AffiliateDisclosure />
        </div>
      </footer>
    </article>
  );
};

export default MarketplaceGuide;
