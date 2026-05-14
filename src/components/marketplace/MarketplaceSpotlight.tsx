import { ExternalLink, Sparkles } from 'lucide-react';
import { useMarketplaceSpotlight } from '@/hooks/useMarketplaceRows';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { formatListingPrice, getOutboundLink } from './marketplaceHelpers';

export function MarketplaceSpotlight() {
  const { listing, loading } = useMarketplaceSpotlight();
  if (loading || !listing) return null;

  const image = listing.images?.[0];
  if (!image) return null;
  const price = formatListingPrice(listing);
  const outbound = getOutboundLink(listing);

  return (
    <section
      aria-label="Featured listing"
      className="mb-10 rounded-3xl border border-border overflow-hidden grid grid-cols-1 md:grid-cols-5 bg-gradient-to-br from-foreground/[0.03] to-transparent"
    >
      <div className="md:col-span-3 relative bg-muted aspect-[16/10] md:aspect-auto md:min-h-[360px]">
        <img
          src={image}
          alt={listing.title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
      </div>
      <div className="md:col-span-2 p-6 md:p-10 flex flex-col justify-center gap-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground self-start">
          <Sparkles style={{ width: 12, height: 12 }} aria-hidden="true" />
          Spotlight
        </span>
        <div>
          <h2 className="text-3xl md:text-4xl font-bold leading-[1.05] tracking-tight text-balance">
            {listing.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">{listing.business_name}</p>
        </div>
        {listing.description && (
          <p
            className="text-sm text-muted-foreground"
            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {listing.description}
          </p>
        )}
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">{price.primary}</p>
          {price.secondary && <p className="text-sm text-muted-foreground">{price.secondary}</p>}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {outbound && (
            <a
              href={outbound.url}
              target="_blank"
              rel={outbound.rel}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90"
            >
              {outbound.label}
              <ExternalLink style={{ width: 14, height: 14 }} aria-hidden="true" />
            </a>
          )}
          <LocalizedLink to={`/marketplace/${listing.slug}`}>
            <Button variant="outline">View details</Button>
          </LocalizedLink>
        </div>
      </div>
    </section>
  );
}
