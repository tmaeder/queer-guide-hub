import { lazy, Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { marketplaceBeacon } from '@/lib/affiliate/marketplace';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { FactGrid } from '@/components/transit/FactGrid';
import { SingleSection } from '@/components/transit/SinglePage';
import { SidebarCard } from '@/components/transit/SidebarCard';
import { StationRing } from '@/components/transit/StationRing';
import { StatLine } from '@/components/transit/StatLine';
import { tagHref } from '@/lib/searchRoutes';
import type { ListingTag } from '@/hooks/usePageFetchers';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

// Lazy: keeps the recharts chunk off the item-detail load (chart renders null for <2 price points)
const MarketplacePriceHistory = lazy(() =>
  import('@/components/marketplace/MarketplacePriceHistory').then((m) => ({
    default: m.MarketplacePriceHistory,
  })),
);

export type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
export type MarketplaceReview = Database['public']['Tables']['marketplace_reviews']['Row'] & {
  profiles: { display_name: string; avatar_url: string | null } | null;
};

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

/**
 * A rating as five station rings — filled ink for earned, open for not.
 *
 * This page carries TransitIcon, so lucide `Star` had to go and there is no
 * star in the transit set. A ring row is not a workaround: `StationRing`
 * already means "stops passed / stops ahead", which is exactly what a rating
 * out of five is. The numeric value stays visible beside it, because the rings
 * are a picture of a number and a picture is not a fact.
 */
export function RatingRings({ value, size = 5 }: { value: number; size?: number }) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: size }).map((_, i) => (
        <StationRing key={i} state={i < filled ? 'done' : 'open'} />
      ))}
    </span>
  );
}

/** Squared trust chip. Replaces the `rounded-full` pill on a zero-radius page. */
function TrustChip({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center bg-muted rounded-element px-2 py-0.5 text-2xs font-bold uppercase tracking-label"
    >
      {label}
    </span>
  );
}

interface BuyBoxProps {
  listing: MarketplaceListing;
  compact?: boolean;
  /** Curated brand name, so the CTA says "Shop TomboyX", not "Shop tomboyx". */
  curatedName?: string | null;
}

/**
 * The commerce rail: price, trust, and every way to reach the seller.
 *
 * Lives in `SinglePage`'s `rail`, which collapses BELOW the body on mobile — so
 * the primary CTA is ALSO rendered in the masthead `action` slot by the page.
 * Without that a phone reader would meet the buy affordance under the reviews.
 * The duplication is deliberate and is the reason this component takes
 * `compact`.
 *
 * There is no cart. The design mock shows "Add to cart"; this marketplace is
 * affiliate-linked and every purchase completes on the seller's own site, so
 * the verb names the destination ("Shop Otherwild") rather than promising a
 * basket that does not exist.
 */
export function MarketplaceBuyBox({ listing, compact = false, curatedName }: BuyBoxProps) {
  const price = formatListingPrice(listing);
  const outbound = getOutboundLink(listing, 'marketplace_detail');

  // One CTR impression per detail view (kind=impression pairs with the /go click).
  useEffect(() => {
    if (!compact && outbound?.isAffiliate) marketplaceBeacon(listing.id, 'marketplace_detail');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, compact]);

  const seller = (displayBrandOf(listing, curatedName) || listing.business_name || '').trim();
  const ctaLabel = seller
    ? outbound?.isAffiliate
      ? `Shop ${seller}`
      : `Take me to ${seller}`
    : outbound?.label;
  const pills = trustPillsFor(listing);
  const linkState = linkHealthState(listing);

  const cta = outbound ? (
    <Button variant="accent" className="w-full" asChild>
      <a
        href={outbound.url}
        target="_blank"
        rel={outbound.rel}
        data-affiliate={outbound.isAffiliate ? 'true' : undefined}
      >
        {ctaLabel}
      </a>
    </Button>
  ) : null;

  if (compact) return cta;

  return (
    <SidebarCard eyebrow="Buy">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            {price.modifier && (
              <span className="text-2xs uppercase tracking-label text-muted-foreground">
                {price.modifier}
              </span>
            )}
            <span className="font-display text-headline leading-none tabular-nums">
              {price.primary}
            </span>
          </div>
          {price.secondary && (
            <p className="mt-1 text-13 text-muted-foreground tabular-nums">{price.secondary}</p>
          )}
        </div>

        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((p) => (
              <TrustChip key={p.key} label={p.label} title={p.title} />
            ))}
          </div>
        )}

        {linkState === 'broken' && (
          <p className="bg-muted rounded-element p-2 text-13">
            This merchant link appears to be broken. Try the contact options below.
          </p>
        )}
        {linkState === 'stale' && (
          <p className="text-13 text-muted-foreground">
            Last verified some time ago — the link may have changed.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {cta}
          {listing.contact_email && (
            <Button variant="outline" className="w-full" asChild>
              <a href={`mailto:${listing.contact_email}`}>Send email</a>
            </Button>
          )}
          {listing.contact_phone && (
            <Button variant="outline" className="w-full" asChild>
              <a href={`tel:${listing.contact_phone}`}>Call {listing.contact_phone}</a>
            </Button>
          )}
          {!outbound && listing.website && (
            <Button variant="outline" className="w-full" asChild>
              <a href={listing.website} target="_blank" rel="noopener noreferrer">
                Visit website
              </a>
            </Button>
          )}
          <EntitySocialLinks links={listing.social_media} size="sm" />
        </div>

        {listing.shipping_available && (
          <p className="bg-muted rounded-element p-2 text-13">Shipping available</p>
        )}

        {outbound?.isAffiliate && <AffiliateDisclosure compact />}
      </div>
    </SidebarCard>
  );
}

/**
 * Module 15 — the rail stat line.
 *
 * Its own rule is that a count belongs here only if it changes what the reader
 * DOES, so `views_count` is deliberately absent: it is vanity, and the review
 * count is already stated beside the rating. What survives is the two numbers a
 * buyer acts on — how much else this maker has, and when we last checked the
 * link still went somewhere.
 */
export function ProductStats({
  listing,
  siblingCount,
}: {
  listing: MarketplaceListing;
  siblingCount: number | null;
}) {
  return (
    <StatLine
      stats={[
        {
          label: 'More from this maker',
          value: siblingCount && siblingCount > 0 ? siblingCount.toLocaleString() : null,
        },
        {
          label: 'Last checked',
          value: listing.link_checked_at
            ? new Date(listing.link_checked_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : null,
        },
      ]}
    />
  );
}

/** Module 01 — the fact strip. */
export function ProductFacts({
  listing,
  curatedName,
}: {
  listing: MarketplaceListing;
  curatedName?: string | null;
}) {
  const dept =
    listing.department && listing.department !== 'other'
      ? departmentLabel(listing.department)
      : null;
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

  // WHY THIS TYPE'S STACK IS PART-RENDERED (singleModules.ts declares
  // required [1, 9, 15, 8], conditional [11, 12, 4]):
  //   01 fact strip   — here.
  //   08 nested entity— BrandStoryBlock, which falls back to a NestedEntityCard
  //                     so the maker appears on every listing with an approved
  //                     brand, not only those with a story.
  //   12 history      — MarketplacePriceHistory below.
  //   15 stat line    — ProductStats above, in the rail.
  //   09 variants     — UNRENDERABLE, and deliberately left that way. No
  //                     variant/size/option/SKU column exists, and rule 2 is
  //                     "a module with no data does not render". The design
  //                     mock shows an S–4XL size picker; wiring an empty one to
  //                     match it would invent options the maker never offered.
  //                     Resolving this needs a variants data model, which is
  //                     its own spec (singleModules.ts:82-95).
  //   11 vouches      — deliberately not rendered. Vouches takes a Roster of
  //                     PEOPLE; marketplace reviews are rated prose, so routing
  //                     them through it would drop the rating and the text.
  const facts = [
    { label: 'Brand', value: displayBrandOf(listing, curatedName) },
    { label: 'Department', value: dept },
    { label: 'Category', value: subcat },
    { label: 'Availability', value: availability },
    { label: 'Ships from', value: listing.location },
    { label: 'Listed', value: new Date(listing.created_at).toLocaleDateString() },
    ...(isAdult ? [{ label: 'Content', value: <Badge variant="outline">Adult</Badge> }] : []),
  ];

  return <FactGrid facts={facts} />;
}

const ATTRIBUTE_ORDER: Array<keyof typeof ATTRIBUTE_KIND_LABELS> = ['material', 'occasion', 'vibe'];

/**
 * Spine slot S4 — the tag array.
 *
 * Its rule is "one unstyled array, equal weight, never truncated", so these are
 * a flat run of chips with no card around them and no "+3 more".
 */
export function ProductTags({ tags }: { tags: ListingTag[] }) {
  const navigate = useNavigate();
  if (!tags.length) return null;

  const grouped = ATTRIBUTE_ORDER.map((kind) => ({
    kind,
    label: ATTRIBUTE_KIND_LABELS[kind],
    items: tags.filter((t) => t.category === kind),
  })).filter((g) => g.items.length > 0);
  const other = tags.filter((t) => !ATTRIBUTE_ORDER.includes(t.category as never));

  const chip = (name: string) => (
    <button
      key={name}
      type="button"
      onClick={() => navigate(tagHref(name))}
      className="inline-flex h-8 items-center px-2.5 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
    >
      {name}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {grouped.map((g) => (
        <div key={g.kind}>
          <p className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {g.label}
          </p>
          <div className="flex flex-wrap gap-2">{g.items.map((t) => chip(t.name))}</div>
        </div>
      ))}
      {other.length > 0 && (
        <div className="flex flex-wrap gap-2">{other.map((t) => chip(t.name))}</div>
      )}
    </div>
  );
}

export function CommunityTags({ listing }: { listing: MarketplaceListing }) {
  const tags = (listing.community_owned_tags ?? []).filter((t) => COMMUNITY_TAG_LABELS[t]);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <Badge key={t} variant="soft">
          {COMMUNITY_TAG_LABELS[t]}
        </Badge>
      ))}
    </div>
  );
}

interface ContentProps {
  listing: MarketplaceListing;
  reviews: MarketplaceReview[];
  onContentUpdated?: () => void;
}

/** Body sections: the description, shipping detail, price history, reviews. */
export function MarketplaceContent({ listing, reviews, onContentUpdated }: ContentProps) {
  const provenance = sourceProvenanceLine(listing);

  return (
    <>
      {listing.description && (
        <SingleSection title="About this listing" note={provenance ?? undefined}>
          <Editable
            contentType="marketplace_listings"
            recordId={listing.id}
            field="description"
            value={listing.description}
            onSaved={onContentUpdated}
            fieldOverride={{ type: 'textarea' }}
            as="div"
          >
            <p className="max-w-reading whitespace-pre-wrap text-body-lg leading-relaxed">
              {listing.description}
            </p>
          </Editable>
        </SingleSection>
      )}

      {listing.shipping_available && listing.shipping_info && (
        <SingleSection title="Shipping">
          <p className="max-w-reading leading-relaxed text-muted-foreground">
            {listing.shipping_info}
          </p>
        </SingleSection>
      )}

      <Suspense fallback={null}>
        <MarketplacePriceHistory listingId={listing.id} />
      </Suspense>

      <SingleSection title={`Reviews (${reviews.length})`}>
        {reviews.length > 0 ? (
          <ul className="m-0 list-none bg-muted rounded-element p-0">
            {reviews.slice(0, 5).map((review) => (
              <li
                key={review.id}
                className="border-b border-foreground/15 px-4 py-4 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-15 font-bold">
                      {review.profiles?.display_name || 'Anonymous'}
                    </span>
                    <RatingRings value={review.rating} />
                    <span className="sr-only">{review.rating} out of 5</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {review.purchase_verified && <Badge variant="outline">Verified</Badge>}
                    <time
                      dateTime={review.created_at}
                      className="text-13 tabular-nums text-muted-foreground"
                    >
                      {new Date(review.created_at).toLocaleDateString()}
                    </time>
                  </div>
                </div>
                {review.title && <p className="mt-2 text-15 font-bold">{review.title}</p>}
                {review.content && (
                  <p className="mt-1 text-15 leading-relaxed text-muted-foreground">
                    {review.content}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No reviews yet.</p>
        )}
      </SingleSection>
    </>
  );
}

/** Moderation controls, parked at the foot of the rail. */
export function ProductAdminRow({
  listing,
  onSaved,
}: {
  listing: MarketplaceListing;
  onSaved?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
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
        onSaved={onSaved ?? (() => window.location.reload())}
      />
    </div>
  );
}

/**
 * `marketplace_listings.brand` is SOURCE data — whatever the merchant feed
 * called itself, so "tomboyx", "OXBALLS", "CELLBLOCK 13", "Forttroff".
 * `marketplace_brands.display_name` is CURATED — "TomboyX", "Oxballs",
 * "CellBlock 13", "Fort Troff". Prefer the curated name wherever we have one.
 *
 * Fixed in the display layer, NOT the data, because
 * `commit_marketplace_staging_item` writes `brand = coalesce(v_brand, brand)`
 * on every re-sync — the marketplace ingest runs daily at 04:00, so
 * normalising the column would revert within a day. Measured 2026-08-15:
 * 1,251 active listings across 7 brands disagree, 1,204 of them by case alone,
 * and the curated name is better in every single case.
 */
export function displayBrandOf(
  listing: MarketplaceListing,
  curatedName?: string | null,
): string | null {
  return (curatedName ?? listing.brand)?.trim() || null;
}

/**
 * The spine eyebrow, e.g. `Apparel · Otherwild`.
 *
 * A plain string, not a node, because `SinglePage`/`DetailMasthead` type the
 * eyebrow as `string` — and widening a primitive shared by thirteen types so
 * one of them can put a link in its kicker is the wrong trade. The brand stays
 * clickable in the rail, where `MakerCard` gives it a whole card instead of
 * four words of tinted text.
 */
export function productEyebrow(listing: MarketplaceListing, curatedName?: string | null): string {
  const dept =
    listing.department && listing.department !== 'other'
      ? departmentLabel(listing.department)
      : null;
  return [dept, displayBrandOf(listing, curatedName)].filter(Boolean).join(' · ') || 'Marketplace';
}

/** Module 08 — the maker, in the rail. */
export function MakerCard({
  listing,
  curatedName,
}: {
  listing: MarketplaceListing;
  curatedName?: string | null;
}) {
  const name = (displayBrandOf(listing, curatedName) || listing.business_name || '').trim();
  if (!name) return null;
  const slug = brandSlug(listing.brand ?? '');
  const to = slug
    ? `/marketplace/brands/${slug}`
    : listing.merchant_domain
      ? `/marketplace/merchants/${listing.merchant_domain}`
      : null;

  return (
    <SidebarCard eyebrow="Maker" title={name}>
      {to && (
        <LocalizedLink
          to={to}
          className="mt-2 inline-block px-4 py-2 text-xs2 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          Everything from {name} →
        </LocalizedLink>
      )}
    </SidebarCard>
  );
}
