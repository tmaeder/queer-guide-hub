/**
 * One-line, direct-voice descriptions for each admin area — the cheap antidote
 * to tribal knowledge. Rendered as a hint strip under the breadcrumb (see
 * AdminAreaHint) and folded into command-palette search. Keyed by route;
 * resolved by longest-prefix so sub-routes inherit their parent's description.
 *
 * Copy follows the design-system voice: factual, no "discover/explore/curated".
 */
export const ADMIN_AREA_DESCRIPTIONS: Record<string, string> = {
  '/admin': 'Operations overview. Metrics, review queues, and system health at a glance.',
  '/admin/inbox':
    'Unified work queue. Triage staging, submissions, moderation, and content in one place.',

  // Content
  '/admin/content': 'All content types in one list. Filter, edit, and bulk-act across entities.',
  '/admin/quality':
    'Truth Engine dashboards. Pending review gates for every entity type in one place.',
  '/admin/content/venues': 'Bars, clubs, and spaces. Edit details, set featured, merge duplicates.',
  '/admin/duplicates': 'Near-duplicate venues. Review side-by-side and merge into a survivor.',
  '/admin/content/events': 'Events and festivals. Edit details, check liveness, set featured.',
  '/admin/content/news_articles': 'News articles. Edit, tag, and manage geo and source data.',
  '/admin/content/personalities':
    'LGBTQ+ personalities. Edit profiles, professions, and connections. Freigabe = Visum-Prinzip (5 Stempel) — Info-Karte oben.',
  '/admin/content/milestones':
    'LGBTQ+ history milestones (public calendar timeline). "KI-Vorschläge suchen" stages AI proposals as pending — filter review_status = pending to approve.',
  '/admin/content/cities': 'Cities. Edit details and merge name-variant duplicates.',
  '/admin/content/countries': 'Countries. Edit metadata, safety, and equality data.',
  '/admin/content/hotels': 'Hotels and BnBs. Edit listings and amenities.',
  '/admin/hotels':
    'Hotels and BnBs. Edit listings, amenities, and regenerate safety notes from signals.',
  '/admin/content/queer_villages': 'Queer villages and neighborhoods. Edit listings.',
  '/admin/villages': 'Queer villages and neighborhoods. Edit listings, scores, and venue links.',
  '/admin/content/marketplace_listings':
    'Marketplace products. Edit listings, prices, and affiliate links.',
  '/admin/marketplace/guides': 'Marketplace guides. Curate product roundups.',
  '/admin/venue-guides': 'Venue guides. Curate place roundups.',
  '/admin/content/community_groups': 'Community groups. Edit listings and details.',
  '/admin/content/group-requests': 'Group join requests. Approve or reject pending members.',
  '/admin/places-editorial':
    'Editorial drafts. Review LLM-written hooks, rails, and covers before publish.',
  '/admin/quests': 'Editorial quests. Manage content-improvement tasks.',
  '/admin/content/unified_tags': 'Tags. Manage the taxonomy, merge duplicates, prune orphans.',
  '/admin/content/cms_pages': 'CMS pages. Edit static and editorial pages.',
  '/admin/media': 'Media library. Upload, optimize, and manage assets.',

  // Import & Review
  '/admin/feedback': 'Community feedback and API error reports. Triage and resolve.',
  '/admin/imports/email-ingestions': 'Email-based ingestion. Track inbound source subscriptions.',

  // Automation
  '/admin/automation': 'Automated workflow rules and triggers.',
  '/admin/pipelines': 'Data pipeline builder and monitor. Sources, runs, and config.',
  '/admin/ingestion-rules': 'Data transformation rules for the ingestion pipeline.',
  '/admin/search-intelligence': 'Search bias and intent learning.',

  // System
  '/admin/users': 'Users and roles. Assign admin, moderator, and editor access.',
  '/admin/analytics': 'Platform-wide usage statistics.',
  '/admin/maps': 'Map tile server status.',
  '/admin/security': 'Security monitoring. RLS, auth, and anomaly detection.',
  '/admin/cloudflare': 'Cloudflare analytics and rules.',
  '/admin/affiliates': 'Affiliate partners. Manage merchant links and payouts.',
  '/admin/redirects': 'URL redirect rules.',
  '/admin/email-templates': 'Transactional email templates.',
  '/admin/recognition': 'Contributor recognition wall.',
  '/admin/audit': 'Audit log. Who changed what, across the admin.',
  '/admin/settings': 'Taxonomy settings. Categories, amenities, services, and attributes.',
};

/**
 * Resolve the description for a pathname using longest-prefix matching, so
 * sub-routes (e.g. /admin/settings/venue-categories) inherit /admin/settings.
 */
export function getAreaDescription(pathname: string): string | undefined {
  let best: { desc: string; len: number } | undefined;
  for (const [route, desc] of Object.entries(ADMIN_AREA_DESCRIPTIONS)) {
    const exact = pathname === route;
    const prefix = route !== '/admin' && pathname.startsWith(route + '/');
    if ((exact || prefix) && (!best || route.length > best.len)) {
      best = { desc, len: route.length };
    }
  }
  // '/admin' is a valid exact match but never a prefix winner above.
  if (!best && pathname === '/admin') return ADMIN_AREA_DESCRIPTIONS['/admin'];
  return best?.desc;
}
