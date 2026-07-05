import { lazy, Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { marketplaceBeacon } from '@/lib/affiliate/marketplace';
import {
  Star,
  MapPin,
  Phone,
  Globe,
  Mail,
  Heart,
  ExternalLink,
  Share2,
  Eye,
  Shield,
  Truck,
  Tag as TagIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import type { Database } from '@/integrations/supabase/types';
import {
  formatListingPrice,
  getOutboundLink,
  linkHealthState,
  sourceProvenanceLine,
  trustPillsFor,
} from '@/components/marketplace/marketplaceHelpers';
import { brandSlug, departmentLabel, ATTRIBUTE_KIND_LABELS } from '@/lib/marketplaceTaxonomy';
import { tagHref } from '@/lib/searchRoutes';
import type { ListingTag } from '@/hooks/usePageFetchers';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

// Lazy: keeps the recharts chunk off the item-detail load (chart renders null for <2 price points)
const MarketplacePriceHistory = lazy(() =>
  import('@/components/marketplace/MarketplacePriceHistory').then((m) => ({
    default: m.MarketplacePriceHistory,
  }))
);

export type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
export type MarketplaceReview = Database['public']['Tables']['marketplace_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

export function getBusinessTypeIcon(type: string | null | undefined) {
  switch (type) {
    case 'online':
      return <Globe size={16} />;
    case 'physical':
      return <MapPin size={16} />;
    case 'both':
      return (
        <div className="flex gap-1">
          <Globe size={16} />
          <MapPin size={16} />
        </div>
      );
    default:
      return null;
  }
}

const COMMUNITY_TAG_LABELS: Record<string, string> = {
  queer_owned: 'Queer-owned',
  trans_owned: 'Trans-owned',
  bipoc_owned: 'BIPOC-owned',
  women_owned: 'Women-owned',
  disabled_owned: 'Disabled-owned',
  nonprofit: 'Nonprofit',
};

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface BuyBoxProps {
  listing: MarketplaceListing;
  reviewsCount: number;
  averageRating: number;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onContentUpdated?: () => void;
}

/** Right-hand product column: identity, price, trust, and the buy CTA. */
export function MarketplaceBuyBox({
  listing,
  reviewsCount,
  averageRating,
  isFavorited,
  onToggleFavorite,
  onShare,
  onContentUpdated,
}: BuyBoxProps) {
  const price = formatListingPrice(listing);
  const outbound = getOutboundLink(listing, 'marketplace_detail');

  // One CTR impression per detail view (kind=impression pairs with the /go click).
  useEffect(() => {
    if (outbound?.isAffiliate) marketplaceBeacon(listing.id, 'marketplace_detail');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);
  // Warmer, seller-forward CTA than the generic "Visit website" — name the
  // shop so the click feels personal (esp. for queer-owned sellers).
  const seller = (listing.brand || listing.business_name || '').trim();
  const ctaLabel = seller
    ? outbound?.isAffiliate
      ? `Shop ${seller}`
      : `Take me to ${seller}`
    : outbound?.label;
  const pills = trustPillsFor(listing);
  const provenance = sourceProvenanceLine(listing);
  const linkState = linkHealthState(listing);
  const communityTags = (listing.community_owned_tags ?? []).filter((t) => COMMUNITY_TAG_LABELS[t]);

  return (
    <div className="flex flex-col gap-6 lg:sticky lg:top-24">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {listing.brand && (
              <p className="text-13 font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {brandSlug(listing.brand) ? (
                  <LocalizedLink
                    to={`/marketplace/brands/${brandSlug(listing.brand)}`}
                    className="hover:text-foreground"
                  >
                    {listing.brand}
                  </LocalizedLink>
                ) : listing.merchant_domain ? (
                  <LocalizedLink
                    to={`/marketplace/merchants/${listing.merchant_domain}`}
                    className="hover:text-foreground"
                  >
                    {listing.brand}
                  </LocalizedLink>
                ) : (
                  listing.brand
                )}
              </p>
            )}
            <h1 className="mt-2 text-display font-display leading-tight">
              <Editable
                contentType="marketplace_listings"
                recordId={listing.id}
                field="title"
                value={listing.title}
                onSaved={onContentUpdated}
              >
                {listing.title}
              </Editable>
            </h1>
          </div>
          {listing.featured && <Badge className="flex-shrink-0">Featured</Badge>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {averageRating > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={16} style={{ fill: 'currentColor' }} aria-hidden="true" />
              <span className="font-medium text-foreground">{averageRating.toFixed(1)}</span>
              <span>({reviewsCount})</span>
            </span>
          )}
          {listing.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} aria-hidden="true" />
              {listing.location}
            </span>
          )}
          {!!listing.views_count && listing.views_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Eye size={14} aria-hidden="true" />
              {listing.views_count}
            </span>
          )}
        </div>

        {communityTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {communityTags.map((t) => (
              <Badge key={t}>{COMMUNITY_TAG_LABELS[t]}</Badge>
            ))}
          </div>
        )}

        {listing.description && (
          <Editable
            contentType="marketplace_listings"
            recordId={listing.id}
            field="description"
            value={listing.description}
            onSaved={onContentUpdated}
            fieldOverride={{ type: 'textarea' }}
            as="div"
          >
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {listing.description}
            </p>
          </Editable>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div>
            <div className="flex items-baseline gap-2">
              {price.modifier && (
                <span className="text-2xs uppercase tracking-wider text-muted-foreground">
                  {price.modifier}
                </span>
              )}
              <span className="text-headline-lg font-display">{price.primary}</span>
            </div>
            {price.secondary && <p className="mt-1 text-sm text-muted-foreground">{price.secondary}</p>}
            {provenance && (
              <p className="mt-1 text-xs2 uppercase tracking-wider text-muted-foreground/70">{provenance}</p>
            )}
          </div>

          {pills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pills.map((p) => (
                <span
                  key={p.key}
                  title={p.title}
                  className="inline-flex items-center rounded-full border border-border bg-background/60 px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {p.label}
                </span>
              ))}
            </div>
          )}

          {linkState === 'broken' && (
            <div className="rounded-element border border-border bg-muted p-2 text-xs text-muted-foreground">
              This merchant link appears to be broken. Try the contact options below.
            </div>
          )}
          {linkState === 'stale' && (
            <p className="text-xs text-muted-foreground">
              Last verified some time ago — link may have changed.
            </p>
          )}

          <Separator />

          <div className="flex flex-col gap-2">
            {outbound && (
              <Button variant="accent" className="w-full" asChild>
                <a
                  href={outbound.url}
                  target="_blank"
                  rel={outbound.rel}
                  data-affiliate={outbound.isAffiliate ? 'true' : undefined}
                >
                  <ExternalLink size={16} className="mr-2" />
                  {ctaLabel}
                </a>
              </Button>
            )}
            {listing.contact_email && (
              <Button variant="outline" className="w-full" asChild>
                <a href={`mailto:${listing.contact_email}`}>
                  <Mail size={16} className="mr-2" />
                  Send Email
                </a>
              </Button>
            )}
            {listing.contact_phone && (
              <Button variant="outline" className="w-full" asChild>
                <a href={`tel:${listing.contact_phone}`}>
                  <Phone size={16} className="mr-2" />
                  Call {listing.contact_phone}
                </a>
              </Button>
            )}
            {!outbound && listing.website && (
              <Button variant="outline" className="w-full" asChild>
                <a href={listing.website} target="_blank" rel="noopener noreferrer">
                  <Globe size={16} className="mr-2" />
                  Visit Website
                </a>
              </Button>
            )}
            <EntitySocialLinks links={listing.social_media} size="sm" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onToggleFavorite}>
              <Heart
                size={16}
                style={{ fill: isFavorited ? 'currentColor' : 'none' }}
                className="mr-2"
              />
              {isFavorited ? 'Saved' : 'Save'}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={onShare}>
              <Share2 size={16} className="mr-2" />
              Share
            </Button>
          </div>

          {listing.shipping_available && (
            <div className="flex items-center gap-2 rounded-element bg-muted p-2 text-sm">
              <Truck size={16} aria-hidden="true" />
              Shipping available
            </div>
          )}

          {outbound?.isAffiliate && <AffiliateDisclosure compact />}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <ReportButton
          contentType="marketplace_listings"
          contentId={listing.id}
          contentName={listing.title}
        />
        <AdminEditButton
          contentType="marketplace_listings"
          contentId={listing.id}
          contentName={listing.title}
          currentData={listing as Record<string, unknown>}
          onSaved={() => window.location.reload()}
        />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs2 uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ProductFacts({ listing }: { listing: MarketplaceListing }) {
  const dept = listing.department && listing.department !== 'other' ? departmentLabel(listing.department) : null;
  const subcat = listing.subcategory ? humanize(listing.subcategory) : null;
  const availability =
    listing.in_stock === true
      ? 'In stock'
      : listing.in_stock === false
        ? 'Out of stock'
        : listing.availability && listing.availability !== 'unknown'
          ? humanize(listing.availability)
          : null;
  const isAdult = listing.content_rating === 'adult' || listing.content_rating === 'explicit';

  const hasAny = listing.brand || dept || subcat || availability || listing.location || isAdult;
  if (!hasAny) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {listing.brand && <Fact label="Brand">{listing.brand}</Fact>}
          {dept && <Fact label="Department">{dept}</Fact>}
          {subcat && <Fact label="Category">{subcat}</Fact>}
          {availability && <Fact label="Availability">{availability}</Fact>}
          {listing.location && <Fact label="Ships from">{listing.location}</Fact>}
          <Fact label="Listed">{new Date(listing.created_at).toLocaleDateString()}</Fact>
          {isAdult && (
            <Fact label="Content">
              <Badge variant="outline">Adult</Badge>
            </Fact>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

const ATTRIBUTE_ORDER: Array<keyof typeof ATTRIBUTE_KIND_LABELS> = ['material', 'occasion', 'vibe'];

function ProductTags({ tags }: { tags: ListingTag[] }) {
  const navigate = useNavigate();
  if (!tags.length) return null;

  const grouped = ATTRIBUTE_ORDER.map((kind) => ({
    kind,
    label: ATTRIBUTE_KIND_LABELS[kind],
    items: tags.filter((t) => t.category === kind),
  })).filter((g) => g.items.length > 0);
  const other = tags.filter((t) => !ATTRIBUTE_ORDER.includes(t.category as never));

  const chip = (name: string) => (
    <Badge
      key={name}
      variant="outline"
      className="cursor-pointer gap-1.5"
      onClick={() => navigate(tagHref(name))}
    >
      <TagIcon size={12} aria-hidden="true" />
      {name}
    </Badge>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {grouped.map((g) => (
          <div key={g.kind}>
            <p className="mb-2 text-xs2 uppercase tracking-[0.12em] text-muted-foreground">{g.label}</p>
            <div className="flex flex-wrap gap-2">{g.items.map((t) => chip(t.name))}</div>
          </div>
        ))}
        {other.length > 0 && <div className="flex flex-wrap gap-2">{other.map((t) => chip(t.name))}</div>}
      </CardContent>
    </Card>
  );
}

interface ContentProps {
  listing: MarketplaceListing;
  reviews: MarketplaceReview[];
  tags: ListingTag[];
}

/** Below-the-fold content column: facts, tags, shipping, history, reviews. */
export function MarketplaceContent({ listing, reviews, tags }: ContentProps) {
  return (
    <div className="flex flex-col gap-6">
      <ProductFacts listing={listing} />
      <ProductTags tags={tags} />

      {listing.shipping_available && listing.shipping_info && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Truck size={16} />
                Shipping
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{listing.shipping_info}</p>
          </CardContent>
        </Card>
      )}

      <Suspense fallback={null}>
        <MarketplacePriceHistory listingId={listing.id} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Reviews ({reviews.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length > 0 ? (
            <div className="flex flex-col">
              {reviews.slice(0, 5).map((review, i) => (
                <div key={review.id} className={i > 0 ? 'border-t border-border pt-4' : ''}>
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Avatar style={{ width: 32, height: 32 }}>
                        <AvatarFallback>{review.profiles?.display_name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {review.profiles?.display_name || 'Anonymous'}
                        </p>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star
                              key={s}
                              size={12}
                              style={{
                                fill: s < review.rating ? 'currentColor' : 'none',
                                color:
                                  s < review.rating ? 'inherit' : 'hsl(var(--muted-foreground))',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.purchase_verified && (
                        <Badge variant="outline" className="text-xs">
                          <Shield size={12} className="mr-1" />
                          Verified
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {review.title && <p className="mb-1 text-sm font-medium">{review.title}</p>}
                  {review.content && <p className="pb-4 text-sm text-muted-foreground">{review.content}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-muted-foreground">No reviews yet.</p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
