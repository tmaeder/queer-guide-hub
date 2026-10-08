/**
 * Executable route-to-reference contract for the subway design-system rollout.
 *
 * A route module must match exactly one family. This is intentionally separate
 * from navigation and SEO metadata: it answers a visual question — which of the
 * supplied design templates owns this page — and makes an unclassified page a
 * test failure instead of an invisible exception.
 */
export type PageDesignFamily =
  | 'home'
  | 'directory'
  | 'single'
  | 'place'
  | 'discovery'
  | 'travel'
  | 'community'
  | 'messaging'
  | 'marketplace'
  | 'account'
  | 'submission'
  | 'static'
  | 'safety'
  | 'print'
  | 'admin';

export interface PageDesignContract {
  reference: string;
  routeMotion: 'journey' | 'none';
  loading: 'track' | 'static';
}

export const PAGE_DESIGN_CONTRACTS: Record<PageDesignFamily, PageDesignContract> = {
  home: { reference: 'Front Page.dc.html', routeMotion: 'journey', loading: 'track' },
  directory: { reference: 'Entity Templates.dc.html', routeMotion: 'journey', loading: 'track' },
  single: {
    reference: 'Content Singles Spec.dc.html',
    routeMotion: 'journey',
    loading: 'track',
  },
  place: { reference: 'Place Templates.dc.html', routeMotion: 'journey', loading: 'track' },
  discovery: {
    reference: 'Discovery Templates.dc.html',
    routeMotion: 'journey',
    loading: 'track',
  },
  travel: { reference: 'Travel Templates.dc.html', routeMotion: 'journey', loading: 'track' },
  community: {
    reference: 'Community Templates.dc.html',
    routeMotion: 'journey',
    loading: 'track',
  },
  messaging: {
    reference: 'Messaging and Plans Templates.dc.html',
    routeMotion: 'journey',
    loading: 'track',
  },
  marketplace: {
    reference: 'Marketplace Templates.dc.html',
    routeMotion: 'journey',
    loading: 'track',
  },
  account: { reference: 'Account Templates.dc.html', routeMotion: 'journey', loading: 'track' },
  submission: {
    reference: 'Account Templates.dc.html',
    routeMotion: 'journey',
    loading: 'track',
  },
  static: { reference: 'Static Templates.dc.html', routeMotion: 'journey', loading: 'track' },
  safety: { reference: 'Static Templates.dc.html', routeMotion: 'none', loading: 'static' },
  print: { reference: 'Trip Booklet.dc.html', routeMotion: 'journey', loading: 'track' },
  admin: { reference: 'Admin Archetypes.dc.html', routeMotion: 'none', loading: 'track' },
};

const DIRECTORY_PAGES = new Set([
  'Cities',
  'Competitions',
  'Events',
  'Guides',
  'HistoryTimeline',
  'Hotels',
  'Marketplace',
  'News',
  'NewsArchive',
  'Organizations',
  'Personalities',
  'Podcasts',
  'TagsIndex',
  'UserDirectory',
  'Venues',
  'Wishlists',
]);

const SINGLE_PAGES = new Set([
  'CompetitionCategoryPage',
  'EntityDetail',
  'EventDetail',
  'GuideDetail',
  'HotelDetail',
  'MilestoneDetail',
  'NewsDetail',
  'NewsStoryDetail',
  'OrganizationDetail',
  'PersonalityDetail',
  'PodcastShow',
  'ProfessionDetail',
  'TagDetail',
  'VenueDetail',
]);

const PLACE_PAGES = new Set(['CityDetail', 'CountryDetail', 'PlaceDetail', 'QueerVillageDetail']);

const STATIC_PAGES = new Set([
  'About',
  'Brand',
  'CMSRoutePage',
  'Contact',
  'Donate',
  'ExtensionInstall',
  'FeedbackBoard',
  'NotFound',
  'Page',
  'ShareTarget',
  'Sitemap',
  'Styleguide',
]);

const SAFETY_PAGES = new Set(['HelpHotlines', 'SubstanceInteractionsPage', 'StiGuidePage']);

function basename(modulePath: string): string {
  return modulePath.split('/').pop() ?? '';
}

export function pageDesignFamilyForModule(modulePath: string): PageDesignFamily | null {
  if (
    modulePath.startsWith('./pages/admin/') ||
    modulePath.startsWith('./components/admin/') ||
    modulePath.startsWith('./components/cms/')
  ) {
    return 'admin';
  }

  if (modulePath === './pages/Index') return 'home';
  if (modulePath === './pages/PatternLibrary') return 'static';
  if (modulePath.includes('/trips/TripBookletPage')) return 'print';
  if (modulePath.startsWith('./pages/trips/')) return 'travel';
  if (modulePath.startsWith('./pages/marketplace/')) return 'marketplace';
  if (modulePath.startsWith('./pages/profile/')) return 'account';
  if (modulePath.startsWith('./pages/onboarding/')) return 'account';
  if (modulePath.startsWith('./pages/intimate/') || modulePath.startsWith('./pages/tools/')) {
    return 'community';
  }
  if (modulePath.startsWith('./pages/people/') || modulePath.startsWith('./pages/hub/')) {
    return 'community';
  }
  if (modulePath.startsWith('./pages/rights/')) {
    return basename(modulePath) === 'TransRights' ? 'safety' : 'static';
  }
  if (modulePath.startsWith('./pages/intent/')) return 'discovery';
  if (modulePath.startsWith('./pages/explore/')) return 'discovery';
  if (modulePath.startsWith('./pages/cities/')) return 'place';
  if (modulePath.startsWith('./pages/travel/')) return 'travel';

  const name = basename(modulePath);
  if (DIRECTORY_PAGES.has(name))
    return name.startsWith('Marketplace') ? 'marketplace' : 'directory';
  if (SINGLE_PAGES.has(name)) return 'single';
  if (PLACE_PAGES.has(name)) return 'place';
  if (STATIC_PAGES.has(name)) return 'static';
  if (SAFETY_PAGES.has(name)) return 'safety';

  if (name.startsWith('Marketplace') || name === 'Wishlist') return 'marketplace';
  if (['Auth', 'AuthCallback', 'ClaimUsername', 'ResetPassword', 'Settings'].includes(name)) {
    return 'account';
  }
  if (['Community', 'GroupDetail', 'GroupInviteAccept', 'Groups'].includes(name)) {
    return 'community';
  }
  if (['Map', 'Pride', 'Travel'].includes(name)) return 'travel';
  // `Cruising` is map-led but is NOT travel: it is the authenticated people +
  // spots discovery surface that /people/dating, /intimate and /discover all
  // redirect into, so it takes the Discovery template alongside SearchResults
  // and ./pages/explore/ rather than the Travel one Map uses.
  if (['SearchResults', 'Cruising'].includes(name)) return 'discovery';
  if (['SubmitForm', 'ContributePage'].includes(name)) return 'submission';

  return null;
}
