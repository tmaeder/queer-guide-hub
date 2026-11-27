/**
 * What a marketplace listing IS, and who is behind it — pure helpers for the
 * listing detail page.
 *
 * Two confusions this exists to end, both measured on prod (2026-11-27):
 *
 * 1. `listing.brand` is the MAKER as the feed spells it (a label, an author,
 *    a photographer), while `business_name` / `merchant_domain` is the SELLER
 *    the outbound link goes to. The CTA used to name the brand, so a book
 *    page read "Take me to Hans Georg & Guibert, Hervé Berger" and landed on
 *    queerbooks.ch. The CTA names the seller now.
 *
 * 2. The `services` department holds custom work, event tickets, memberships,
 *    donations, gift cards and checkout add-ons (shipping protection, returns
 *    cover). "In stock" and "Buy" describe none of them. The kind is read off
 *    the listing's own subcategory and title; nothing here invents a fact.
 */

export type ListingOfferKind =
  'product' | 'service' | 'ticket' | 'membership' | 'donation' | 'gift_card' | 'addon';

export interface ListingKindInput {
  department?: string | null;
  subcategory?: string | null;
  title?: string | null;
}

// Order matters: an add-on is tested first because "Free Returns + Package
// Protection" must never read as a product; tickets before services so a
// "Pottery Workshop" ticket does not read as custom work.
const KIND_PATTERNS: Array<[Exclude<ListingOfferKind, 'product' | 'service'>, RegExp]> = [
  [
    'addon',
    /\b(shipping protection|package protection|order protection|return(s)? (coverage|protection)|free (unlimited )?returns?|unlock free returns|insurance|carbon (neutral|offset)|add-on)\b/i,
  ],
  ['donation', /\b(donation|donate|spende)\b/i],
  ['gift_card', /\b(gift ?cards?|e-?gift|gift voucher|gutschein|geschenkgutschein)/i],
  ['membership', /\b(membership|member|subscription|insiders club)\b/i],
  [
    'ticket',
    /\b(tickets?|pass|entrance|entry|vip|event|workshop|experience|supper club|night|class|tasting)\b/i,
  ],
];

export function listingOfferKind(listing: ListingKindInput): ListingOfferKind {
  if (listing.department !== 'services') return 'product';
  const haystack = `${listing.subcategory ?? ''} ${listing.title ?? ''}`;
  for (const [kind, re] of KIND_PATTERNS) if (re.test(haystack)) return kind;
  return 'service';
}

/** Kinds where a stock state ("In stock") is the wrong grammar. */
export function hidesStockState(kind: ListingOfferKind): boolean {
  return kind !== 'product';
}

/** The fact-strip "Type" value for a non-product kind, else null. */
export function offerKindLabel(kind: ListingOfferKind): string | null {
  switch (kind) {
    case 'service':
      return 'Service';
    case 'ticket':
      return 'Ticket or booking';
    case 'membership':
      return 'Membership';
    case 'donation':
      return 'Donation';
    case 'gift_card':
      return 'Gift card';
    case 'addon':
      return 'Checkout add-on';
    default:
      return null;
  }
}

/** The verb on the outbound button, naming the seller. */
export function offerCtaLabel(kind: ListingOfferKind, seller: string): string {
  switch (kind) {
    case 'service':
      return `Request at ${seller}`;
    case 'ticket':
      return `Book at ${seller}`;
    case 'membership':
      return `Join at ${seller}`;
    case 'donation':
      return `Donate at ${seller}`;
    case 'addon':
      return `See at ${seller}`;
    default:
      return `Buy at ${seller}`;
  }
}

/**
 * One honest line about what this page cannot tell you, for kinds where the
 * deciding facts live with the seller. Names who confirms; promises nothing.
 */
export function offerNote(kind: ListingOfferKind, seller: string): string | null {
  switch (kind) {
    case 'service':
      return `Scope, turnaround and shipping are set by ${seller}. Check them before you order.`;
    case 'ticket':
      return `Date, place and availability are set by ${seller}. Check them before you book.`;
    case 'membership':
      return `Billing terms and benefits are set by ${seller}.`;
    case 'donation':
      return `Your donation goes to ${seller}.`;
    case 'addon':
      return `An add-on ${seller} offers at checkout, not a product on its own.`;
    default:
      return null;
  }
}

export interface SellerInput {
  business_name?: string | null;
  merchant_domain?: string | null;
  brand?: string | null;
}

function hostLabel(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Who sells it: the merchant the outbound link goes to, never the maker.
 *
 * `merchant_domain` is the truth; `business_name` is feed data and on ~18k of
 * ~62k active listings (2026-11-27) it names the BRAND or a SKU, not the shop:
 * Alba Optics' three listings carry business_name "Alba Optics" and are sold
 * by jeufcycling.com. So the name is trusted only when it matches the domain
 * ("QueerBooks" @ queerbooks.ch); otherwise the domain is named. When the
 * merchant IS the brand, the curated spelling wins ("TomboyX").
 */
export function sellerNameOf(
  listing: SellerInput,
  curatedBrandName?: string | null,
): string | null {
  const business = listing.business_name?.trim() || null;
  const domain = listing.merchant_domain?.trim() ? hostLabel(listing.merchant_domain.trim()) : null;
  let seller: string | null;
  if (domain && business) {
    const host = squash(domain.replace(/\.[a-z]{2,}$/i, ''));
    const name = squash(business);
    seller = name && (host.includes(name) || name.includes(host)) ? business : domain;
  } else {
    seller = business ?? domain;
  }
  if (!seller) return curatedBrandName?.trim() || listing.brand?.trim() || null;
  if (curatedBrandName && squash(curatedBrandName) === squash(seller))
    return curatedBrandName.trim();
  return seller;
}

/**
 * The label for `listing.brand`. On books it is whoever the bookseller credits
 * (author, photographer, editor), so "By"; elsewhere it is the label.
 */
export function makerRoleLabel(department: string | null | undefined): string {
  return department === 'books_art' ? 'By' : 'Brand';
}

/** True when `brand` names someone other than the seller. */
export function makerDiffersFromSeller(
  brand: string | null | undefined,
  seller: string | null,
): boolean {
  const b = brand?.trim().toLowerCase();
  if (!b) return false;
  return !seller || b !== seller.trim().toLowerCase();
}

/**
 * A valid ISBN-13 the seller's own product URL carries (queerbooks.ch slugs end
 * `-isbn-9783863005092`). Checksum-validated, so a random 13-digit run is not
 * published as an ISBN.
 */
export function isbnFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(/isbn[-_:]?(97[89]\d{10})(?!\d)/i);
  if (!m) return null;
  const d = m[1].split('').map(Number);
  const sum = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12] ? m[1] : null;
}

function normLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

/** "Books & Art" and "Books And Art" are the same label. */
export function sameLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normLabel(a) === normLabel(b);
}

/**
 * The rest of a description after the lead already showed its opening, or null
 * when the lead showed all of it. Falls back to the whole text when the opening
 * was cut mid-sentence (ends with an ellipsis), so nothing reads truncated.
 */
export function descriptionRemainder(full: string, opening: string): string | null {
  const text = full.trim();
  const lead = opening.trim();
  if (!text) return null;
  if (!lead) return text;
  if (lead.endsWith('…')) return text;
  if (!text.startsWith(lead)) return text;
  const rest = text.slice(lead.length).trim();
  return rest || null;
}

/**
 * The category chip for a department's catch-all group. The classifier files
 * listings that match no finer arm under a group with the department's own
 * slug (apparel → "apparel"), which the vocabulary names "Clothing": a chip
 * that reads as a sibling of Tops and Bottoms while it holds their leftovers.
 */
export function groupChipLabel(
  group: string,
  department: string,
  label: string,
  departmentName: string,
): string {
  return group === department ? `Other ${departmentName.toLowerCase()}` : label;
}

/**
 * Where a merchant URL redirects when the seller has an organization profile:
 * its catalogue section, flagged as a shopping visit. The organization page
 * reads `from=shop`; `#shop` is the id of its shop section.
 */
export function merchantOrgRedirectPath(orgSlug: string): string {
  return `/organizations/${encodeURIComponent(orgSlug)}?from=shop#shop`;
}
