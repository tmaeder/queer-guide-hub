import { observeReferenceTaxonomies } from './referenceTaxonomyStore';
export let ORG_ROLE_LABELS: Record<string, string> = {
  venue: 'Venue',
  hotel: 'Hotel',
  seller: 'Merchant',
  affiliate_partner: 'Partner',
  brand: 'Brand',
  publisher: 'Publisher',
  support: 'Support',
  advocacy: 'Advocacy',
  organizer: 'Organizer',
  community: 'Community',
};

observeReferenceTaxonomies((taxonomy, terms) => {
  if (taxonomy === 'organization_role')
    ORG_ROLE_LABELS = Object.fromEntries(terms.map((term) => [term.value, term.name]));
});
