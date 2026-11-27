import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight, Globe, Mail, Phone, Newspaper, ShoppingBag } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { MapInset } from '@/components/transit/MapInset';
import { PhotoInset } from '@/components/transit/PhotoInset';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { orgRoleLabel } from '@/lib/entityKindLabels';
import { ShareMenu } from '@/components/share/ShareMenu';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { displayWebsite, hasSocialLinks } from '@/lib/entityContact';
import { EntityMap } from '@/components/map/EntityMap';
import { NearbyMapLegend } from '@/components/map/NearbyMapLegend';
import { NewsCard } from '@/components/news/NewsCard';
import { useNearbyMapPoints } from '@/hooks/useNearbyMapPoints';
import { TagChipRow } from '@/components/tags/TagChipRow';
import { formatPhoneDisplay, formatPhoneHref } from '@/lib/formatPhone';
import {
  useOrganizationArticles,
  useOrganizationDescriptionI18n,
  type Organization,
  type OrgRole,
} from '@/hooks/useOrganization';
import { MachineTranslatedText } from '@/components/content/MachineTranslatedText';
import { contentLocaleKey } from '@/lib/localizeContent';

/**
 * The first sentence of a description, for the masthead lead. The About
 * section then shows the full text only when it says more than that, so a
 * one-sentence description is printed once instead of twice (hero + About).
 */
export function firstSentence(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^.+?[.!?](?=\s+\p{Lu}|\s*$)/su);
  return (m ? m[0] : trimmed).trim();
}

/** Masthead lead: the editorial hook, else the description's first sentence. */
export function orgLeadText(org: Pick<Organization, 'editorial_hook' | 'description'>) {
  return org.editorial_hook?.trim() || firstSentence(org.description);
}

/** About text, or null when it would only repeat the lead. */
export function orgAboutText(
  org: Pick<Organization, 'editorial_hook' | 'editorial_long' | 'description'>,
): string | null {
  if (org.editorial_long?.trim()) return org.editorial_long;
  const description = org.description?.trim();
  if (!description) return null;
  return description === orgLeadText(org) ? null : description;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** True when the role describes a service you contact rather than a place you visit. */
export function orgIsService(org: Pick<Organization, 'roles'>): boolean {
  return org.roles.includes('support') || org.roles.includes('advocacy');
}

export type OrgPrimaryAction =
  | { kind: 'products'; href: '#shop' }
  | { kind: 'publication' | 'website'; href: string }
  | { kind: 'phone' | 'email'; href: string }
  | { kind: 'location'; href: '#location' };

/**
 * ONE primary verb chosen by what the organisation is for. It used to be a
 * "Location & contact" anchor on every organisation, including an online
 * publication whose location section held only its domain.
 *
 * `fromShop` is set when the visitor arrived from the marketplace (the
 * merchant redirect), so the shopping task stays first.
 */
export function orgPrimaryAction(
  org: Organization,
  { fromShop = false }: { fromShop?: boolean } = {},
): OrgPrimaryAction | null {
  const shop = orgShowsShopGrid(org);
  if (shop && fromShop) return { kind: 'products', href: '#shop' };
  if (org.roles.includes('publisher') && org.website) {
    return { kind: 'publication', href: org.website };
  }
  if (orgIsService(org)) {
    const tel = formatPhoneHref(orgPhone(org));
    if (tel) return { kind: 'phone', href: tel };
    const email = org.email?.trim();
    if (email && EMAIL_RE.test(email) && !/mailto/i.test(email))
      return { kind: 'email', href: `mailto:${email}` };
    if (org.website) return { kind: 'website', href: org.website };
  }
  if (shop) return { kind: 'products', href: '#shop' };
  if (orgHasLocationOrContact(org)) return { kind: 'location', href: '#location' };
  return null;
}

/** Whether the visitor arrived from the marketplace merchant redirect. */
export function arrivedFromShop(loc: { search?: string; hash?: string } | undefined): boolean {
  if (!loc) return false;
  return new URLSearchParams(loc.search ?? '').get('from') === 'shop' || loc.hash === '#shop';
}

export function OrgPrimaryActionButton({ action }: { action: OrgPrimaryAction }) {
  const { t } = useTranslation();
  const external = action.kind === 'publication' || action.kind === 'website';
  const label =
    action.kind === 'products'
      ? t('pages.entityDetail.viewProducts', 'View products')
      : action.kind === 'publication'
        ? t('pages.entityDetail.visitPublication', 'Visit publication')
        : action.kind === 'website'
          ? t('pages.entityDetail.contactWebsite', 'Contact via website')
          : action.kind === 'phone'
            ? t('pages.entityDetail.contactCall', 'Call')
            : action.kind === 'email'
              ? t('pages.entityDetail.contactEmail', 'Email')
              : t('venues.detail.section.location', 'Location & contact');
  const Icon =
    action.kind === 'products'
      ? ShoppingBag
      : action.kind === 'phone'
        ? Phone
        : action.kind === 'email'
          ? Mail
          : external
            ? Globe
            : ArrowRight;
  return (
    <Button asChild variant={action.kind === 'location' ? 'soft' : 'default'}>
      <a
        href={action.href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
      >
        <Icon size={16} aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}

/**
 * Tag slugs that describe how a person can use the service rather than what
 * the service is. `unified_tags.category` cannot split them: on the PROFA
 * record 10 of 19 tags have no active glossary row at all, and the rest file
 * wheelchair access under "Venue Features & Policies" beside "queer-friendly".
 */
export const ORG_ACCESS_TAGS = new Set([
  'walk-in',
  'appointment-only',
  'by-appointment',
  'interpreter-available',
  'sign-language-interpreted',
  'wheelchair-accessible',
  'step-free-entrance',
  'accessible-restroom',
  'anonymous-testing',
  'free-of-charge',
  'free',
  'online-counselling',
]);

/** Services vs access/visiting tags, order kept. Unknown slugs stay services. */
export function orgTagGroups(tags: string[] | null | undefined) {
  const services: string[] = [];
  const access: string[] = [];
  for (const tag of tags ?? []) (ORG_ACCESS_TAGS.has(tag) ? access : services).push(tag);
  return { services, access };
}

/**
 * Grouped tags for a support organisation, rendered as a section after
 * contact rather than as 19 equal chips in the masthead. Tags are listings,
 * not verified offers, and the heading says so.
 */
export function OrgServiceTags({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const { services, access } = orgTagGroups(org.tags);
  if (!services.length && !access.length) return null;
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-reading text-15 text-muted-foreground">
        {t(
          'pages.entityDetail.serviceTagsNote',
          'As listed for this organisation. Check with them that a service is offered when you need it.',
        )}
      </p>
      {services.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-15 font-bold">
            {t('pages.entityDetail.servicesListed', 'Services listed')}
          </h3>
          <TagChipRow tags={services} max={24} icon more="expand" />
        </div>
      )}
      {access.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-15 font-bold">
            {t('pages.entityDetail.accessListed', 'Access and visiting')}
          </h3>
          <TagChipRow tags={access} max={24} icon more="expand" />
        </div>
      )}
    </div>
  );
}

/**
 * Decision facts beside the action. Organisations carry no hours, cost or
 * eligibility columns, so for a service the honest line is what to check.
 * Move to `single.summary` at merge.
 */
export function OrgServiceSummary({ org }: { org: Organization }) {
  const { t } = useTranslation();
  if (!orgIsService(org)) return null;
  const walkIn = org.tags?.includes('walk-in');
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-15" data-testid="org-service-summary">
      {walkIn && (
        <li className="font-bold">
          {t('pages.entityDetail.summary.walkIn', 'Listed as offering walk-in visits')}
        </li>
      )}
      <li>
        {t(
          'pages.entityDetail.summary.checkFirst',
          'Opening hours, costs and appointment rules are not listed here. Contact them first.',
        )}
      </li>
    </ul>
  );
}

/** Kept as the org-page name for the shared label map in `EntityKindChips`. */
export function roleLabel(role: OrgRole, t: TFunction): string {
  return orgRoleLabel(role, t);
}

/** Cover photo — what the old hero carried that is not the masthead. Rendered
 *  at the top of the body, the same slot `VenueBodyLead` uses. */
export function OrgBodyLead({ org }: { org: Organization }) {
  const cover = org.cover_image_url || org.images?.[0] || org.logo_url || null;
  return (
    <PhotoInset
      src={cover}
      alt={org.name}
      fallbackEntityType="default"
      fallbackKey={org.id}
      priority
      caption={org.legal_name && org.legal_name !== org.name ? org.legal_name : null}
    />
  );
}

/** Masthead actions. Deliberately NO website button: the website lives once,
 *  in the "Location & contact" section, on organisation and venue alike. */
export function OrgActions({ org }: { org: Organization }) {
  return (
    <>
      <ShareMenu
        url={
          typeof window !== 'undefined'
            ? window.location.href
            : `https://queer.guide/organizations/${org.slug}`
        }
        title={org.name}
        entity={{
          entity_table: 'organizations',
          entity_id: org.id,
          title: org.name,
          subtitle: org.venues[0]?.city ?? null,
          image_url: org.cover_image_url ?? org.images?.[0] ?? org.logo_url ?? null,
          path: `/organizations/${org.slug}`,
        }}
      />
      <ReportButton contentType="organizations" contentId={org.id} contentName={org.name} />
      <AdminEditButton
        contentType="organizations"
        contentId={org.id}
        contentName={org.name}
        currentData={org as unknown as Record<string, unknown>}
        exportable
      />
    </>
  );
}

export function OrgAbout({ org }: { org: Organization }) {
  const { i18n } = useTranslation();
  const about = orgAboutText(org);
  // Only `description` is machine-translated; editorial copy is shown as written.
  const translatable = !org.editorial_long && Boolean(about);
  const { data: descriptionI18n } = useOrganizationDescriptionI18n(
    org.id,
    translatable && contentLocaleKey(i18n.language) !== 'en',
  );
  if (!about) return null;
  const render = (text: string) => (
    // No heading of its own: the `SingleSection` around it renders "About".
    <p className="max-w-reading whitespace-pre-line text-body-lg leading-relaxed">{text}</p>
  );
  if (!translatable) return render(about);
  return (
    <MachineTranslatedText
      entityType="organizations"
      entityId={org.id}
      original={about}
      i18n={descriptionI18n}
    >
      {render}
    </MachineTranslatedText>
  );
}

/**
 * Whether the org page renders its own Shop grid. When it does, the grid's
 * count ("24 of 2,057 listings") is the shop's count, and a second figure here
 * would contradict it: `product_count` also counts listings the grid does not
 * show (measured on /organizations/marek-richard: 2,594 vs 2,057).
 */
export function orgShowsShopGrid(org: Organization): boolean {
  return org.roles.includes('seller') && org.product_count > 0 && Boolean(org.website_domain);
}

export function OrgWhatTheyDo({ org }: { org: Organization }) {
  const { t } = useTranslation();
  // Venues are not counted here: they have their own "Location & contact"
  // section, the same one the venue page carries.
  const showSeller = org.roles.includes('seller') && !orgShowsShopGrid(org);
  // Zero indexed articles says nothing about the publication itself (it may
  // simply not be linked to a feed here), so the card only renders with a count.
  const showPublisher = org.roles.includes('publisher') && org.article_count > 0;
  const hasAny = showPublisher || showSeller;
  if (!hasAny) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {showPublisher && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <Newspaper size={20} className="text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium">
                {t(
                  'pages.entityDetail.articlesIndexed',
                  '{{count}} articles indexed on Queer Guide',
                  {
                    count: org.article_count,
                  },
                )}
              </div>
              <div className="text-13 text-muted-foreground">
                {t('pages.entityDetail.rolePublisher', 'News outlet')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {showSeller && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <ShoppingBag size={20} className="text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium">
                {t('pages.entityDetail.productsCount', '{{count}} products', {
                  count: org.product_count,
                })}
              </div>
              <div className="text-13 text-muted-foreground">
                {t('pages.entityDetail.roleSeller', 'Shop')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Masthead tag row — the same slot venue uses for `VenueTags`. */
export function OrgTags({ org }: { org: Organization }) {
  if (!org.tags?.length) return null;
  return <TagChipRow tags={org.tags} max={16} icon more="expand" />;
}

/** The organisation's own phone, else its primary venue's (the RPC lists the
 *  primary venue first). Most organisations are the identity behind one venue
 *  and were minted before the venue's number arrived, so `organizations.phone`
 *  is empty on ~2,200 of them while the venue has one. */
export function orgPhone(org: Organization): string | null {
  return org.phone || org.venues[0]?.phone || null;
}

/** True when the organisation has anything for the "Location & contact"
 *  section — so the descriptor's guard and the component's null-return agree. */
export function orgHasLocationOrContact(org: Organization): boolean {
  return Boolean(
    org.venues.length > 0 ||
    org.website ||
    org.email ||
    formatPhoneHref(orgPhone(org)) ||
    hasSocialLinks(org.social),
  );
}

/**
 * The organisation's "Location & contact" — the same section, in the same
 * place and with the same markup, as the venue page's `VenueLocationContact`.
 *
 * The website renders here and NOWHERE else on the page. It used to appear
 * three times: as the domain beside the role badges, as a "Visit website"
 * button in the hero, and in the Contact sidebar card — plus a fourth time when
 * `social` held a `website` key, which `EntitySocialLinks` is told to skip.
 */
export function OrgLocationContact({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const located = org.venues.filter((v) => v.latitude != null && v.longitude != null);
  const center = located[0];
  // Only enrich with surroundings for a single-location org — a multi-city org's
  // own markers already span the map and "nearby" around one of them misleads.
  // A support service's map is for directions only; nearby bars and events
  // there are a discovery feature that interrupts someone looking for help.
  const withNearby = located.length === 1 && !orgIsService(org);
  const nearbyPoints = useNearbyMapPoints({
    lat: withNearby && center ? Number(center.latitude) : null,
    lng: withNearby && center ? Number(center.longitude) : null,
    excludeType: 'venue',
    excludeId: center?.id ?? null,
  });
  const phone = orgPhone(org);
  const phoneHref = formatPhoneHref(phone);
  const hasContact = Boolean(org.website || org.email || phoneHref || hasSocialLinks(org.social));
  if (!center && !hasContact && org.venues.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* Contact first, map after: the contact route is the next step; the
            map is where to go once that is settled. */}
        {hasContact && (
          <div className="flex min-w-0 flex-col gap-4">
            {/* `flex items-center` on the link, not just the row: the base layer
                gives every <a> min-height 44px, so a bare link is a 44px block
                whose text sits at its top while the icon is centred. */}
            {org.email && (
              <div className="flex items-center gap-2">
                <Mail size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={`mailto:${org.email}`}
                  className="flex min-w-0 items-center text-sm text-primary hover:underline"
                >
                  <span className="truncate">{org.email}</span>
                </a>
              </div>
            )}
            {phoneHref && (
              <div className="flex items-center gap-2">
                <Phone size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={phoneHref}
                  className="flex items-center text-sm text-primary hover:underline"
                >
                  {formatPhoneDisplay(phone)}
                </a>
              </div>
            )}
            {org.website && (
              <div className="flex items-center gap-2">
                <Globe size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={org.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex min-w-0 items-center text-sm text-primary hover:underline"
                >
                  <span className="truncate">{displayWebsite(org.website)}</span>
                </a>
              </div>
            )}
            <EntitySocialLinks
              links={org.social}
              size="sm"
              exclude={org.website ? ['website'] : undefined}
            />
          </div>
        )}
        {center && (
          <MapInset className="border-0 p-0">
            <EntityMap
              center={[Number(center.longitude), Number(center.latitude)]}
              zoom={located.length > 1 ? 4 : 15}
              height={nearbyPoints.length > 0 ? 220 : 180}
              markers={[
                ...located.map((v) => ({
                  id: v.id,
                  lat: Number(v.latitude),
                  lng: Number(v.longitude),
                  name: v.name,
                  subtitle: v.city ?? undefined,
                  type: 'venues' as const,
                  linkTo: `/venues/${v.slug}`,
                  primary: v.id === center.id,
                })),
                ...nearbyPoints,
              ]}
            />
            <NearbyMapLegend markers={nearbyPoints} />
          </MapInset>
        )}
      </div>

      {/* Module 08 — the type's OWNER module. A business is legible only through
          the entities it operates, and each one carries the VENUE bullet, not the
          organization's: spec rule 4, "cross-type links use the other type's
          bullet, so the network is legible from inside any page." */}
      {org.venues.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {org.venues.map((v) => (
            <NestedEntityCard
              key={v.id}
              type="venue"
              eyebrow={t('pages.entityDetail.kindVenue', 'Venue')}
              name={v.name}
              description={v.city}
              href={`/venues/${v.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgArticles({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const { data: articles = [], isLoading } = useOrganizationArticles(orgId, true);
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <NewsCard key={i} loading />
        ))}
      </div>
    );
  }
  if (articles.length === 0) {
    return (
      <p className="text-muted-foreground">
        {t('pages.entityDetail.noArticles', 'No articles yet.')}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}
