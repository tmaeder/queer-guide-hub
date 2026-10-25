/**
 * Admin Navigation Configuration
 * Four-section layout: Workspace (daily review work and staff communication),
 * Content (records and assets), Data & automation (ingestion and tooling),
 * System (admin-only ops + configuration).
 * Central config for the unified admin sidebar. Each section groups related nav items.
 * Used by AdminSidebar, AdminCommandPalette and the cockpit's JumpToGrid.
 *
 * Two rules this file has to keep:
 *  1. Each section's FIRST item is what `getBreadcrumbsForRoute` links the
 *     section crumb to — so it must be reachable at the section's own minRole.
 *     Never lead a section with an `adminOnly` item.
 *  2. Item icons must be unique across the whole tree: the collapsed 64px rail
 *     drops section chrome and renders a flat icon list, where a repeated icon
 *     is unresolvable.
 *
 * Deliberately NOT in the nav (deep-link only, reached from their own hub):
 *   /admin/content/event-quality  — linked from QualityHub
 *   /admin/content/liveness       — linked from the inbox queue registry
 *   /admin/content/<entity>-quality — all redirect to /admin/quality
 */

import {
  LayoutDashboard,
  Inbox,
  BarChart3,
  Shield,
  Cloud,
  Layers,
  Building,
  Calendar,
  Newspaper,
  UserRoundPen,
  Rss,
  Users,
  UserCog,
  Tag,
  ListTree,
  ShoppingBag,
  BookOpen,
  UsersRound,
  FileText,
  Image,
  Download,
  Settings,
  Mail,
  Send,
  Route as RouteIcon,
  Handshake,
  Workflow,
  Timer,
  History,
  MessageSquarePlus,
  Search,
  Palette,
  SpellCheck,
  Award,
  Waypoints,
  Network,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROLE_RANK, type AdminRole } from '@/config/adminRoles';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AdminNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  /** Supabase table name for count badge (optional) */
  countTable?: string;
  /** Direct key from get_admin_counts RPC for review-queue-style counts */
  reviewCountKey?: string;
  /** Whether this item requires admin role (not just moderator).
   *  Shorthand for `minRole: 'admin'`. */
  adminOnly?: boolean;
  /** Minimum role to see/access this item. Overrides the section default and
   *  `adminOnly`. Resolution order: minRole → adminOnly?'admin' → section.minRole
   *  → 'editor'. See resolveItemMinRole / getRouteMinRole. */
  minRole?: AdminRole;
  /** Optional lightweight subheader label within a section (e.g. "Places",
   *  "People"). Items sharing a `group` render under one muted subheader, in
   *  declaration order. Ungrouped items keep their declared position. */
  group?: string;
  /** Familiar terms and previous labels used by navigation search. */
  keywords?: string[];
}

export interface AdminNavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Whether the section starts expanded. Every section is collapsible — the
   *  old `collapsible?: boolean` flag was never read by AdminSidebar. */
  defaultExpanded?: boolean;
  /** Default minimum role for items in this section (item-level wins). */
  minRole?: AdminRole;
  items: AdminNavItem[];
}

// ── Navigation Sections ────────────────────────────────────────────────────────

export const adminNavSections: AdminNavSection[] = [
  {
    id: 'cockpit',
    label: 'Workspace',
    icon: LayoutDashboard,
    defaultExpanded: true,
    minRole: 'editor',
    items: [
      {
        id: 'overview',
        label: 'Review queue',
        icon: Inbox,
        route: '/admin',
        keywords: [
          'dashboard',
          'cockpit',
          'overview',
          'governance',
          'review',
          'quality',
          'triage',
          'inbox',
          'approvals',
          'duplicates',
          'merge',
          'editorial drafts',
          'places editorial',
        ],
      },

      {
        id: 'feedback',
        label: 'Feedback',
        icon: MessageSquarePlus,
        route: '/admin?queue=feedback',
      },
      {
        id: 'postfach',
        label: 'Staff messages',
        icon: Mail,
        route: '/admin/postfach',
        keywords: ['postfach', 'mailbox', 'staff', 'messages'],
      },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    icon: Layers,
    defaultExpanded: false,
    minRole: 'editor',
    items: [
      {
        id: 'all-content',
        label: 'All content',
        icon: Layers,
        route: '/admin/content',
      },
      {
        id: 'events',
        label: 'Events',
        icon: Calendar,
        route: '/admin/content/events',
        countTable: 'events',
        group: 'Places & events',
      },
      {
        id: 'organizations',
        label: 'Organisations',
        minRole: 'admin',
        icon: Building,
        route: '/admin/content/organizations',
        countTable: 'organizations',
        keywords: ['business', 'vendors', 'brands', 'hotels'],
        group: 'Places & events',
      },
      {
        id: 'geography',
        label: 'Geography',
        icon: Network,
        route: '/admin/geography',
        group: 'Places & events',
        keywords: ['countries', 'cities', 'villages', 'places'],
      },
      {
        id: 'personalities',
        label: 'Personalities',
        icon: Users,
        route: '/admin/content/personalities',
        countTable: 'personalities',
        group: 'People & community',
      },
      {
        id: 'milestones',
        label: 'Milestones',
        icon: Award,
        route: '/admin/content/milestones',
        countTable: 'milestones',
        group: 'People & community',
      },
      {
        id: 'groups',
        label: 'Groups',
        icon: UsersRound,
        route: '/admin/content/community_groups',
        countTable: 'community_groups',
        group: 'People & community',
      },
      // Editorial
      {
        id: 'news',
        label: 'News',
        icon: Newspaper,
        route: '/admin/content/news_articles',
        countTable: 'news_articles',
        group: 'Editorial',
      },
      {
        id: 'news-sources',
        label: 'News Sources',
        icon: Rss,
        route: '/admin/news-sources',
        minRole: 'moderator',
        group: 'Editorial',
      },
      {
        id: 'news-authors',
        minRole: 'moderator',
        label: 'News Authors',
        icon: UserRoundPen,
        route: '/admin/news-authors',
        group: 'Editorial',
      },
      {
        id: 'guides',
        label: 'Guides',
        icon: BookOpen,
        route: '/admin/content/guides',
        countTable: 'guides',
        group: 'Editorial',
      },
      {
        id: 'pages',
        label: 'Pages',
        icon: FileText,
        route: '/admin/content/cms_pages',
        countTable: 'cms_pages',
        group: 'Editorial',
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: ShoppingBag,
        route: '/admin/content/marketplace_listings',
        countTable: 'marketplace_listings',
        group: 'Commerce',
      },
      {
        id: 'affiliate',
        label: 'Affiliate',
        icon: Handshake,
        route: '/admin/affiliate',
        adminOnly: true,
        group: 'Commerce',
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        route: '/admin/content/unified_tags',
        countTable: 'unified_tags',
        keywords: ['vocabularies', 'taxonomy', 'taxonomies', 'settings'],
        group: 'Tags, vocabularies & media',
      },
      {
        id: 'taxonomies',
        label: 'Taxonomies',
        icon: ListTree,
        route: '/admin/taxonomies',
        minRole: 'moderator',
        keywords: ['categories', 'vocabularies', 'classifications', 'amenities', 'services'],
        group: 'Tags, vocabularies & media',
      },
      {
        id: 'media-library',
        label: 'Media & assets',
        icon: Image,
        route: '/admin/media',
        group: 'Tags, vocabularies & media',
      },
      {
        // Cross-type, so it cannot live under any one content type. The whole
        // point is recovering something when you no longer remember which type
        // it was.
        id: 'trash',
        label: 'Trash',
        icon: Trash2,
        route: '/admin/trash',
        keywords: ['deleted', 'restore', 'recovery'],
      },
    ],
  },

  // ── Data — source ingestion lives in Pipelines; automations retain their moderator access. ──
  {
    id: 'data',
    label: 'Data & automation',
    icon: Download,
    defaultExpanded: false,
    minRole: 'moderator',
    items: [
      {
        // The cron / job registry that drives every engine above it.
        id: 'automation',
        label: 'Automations',
        icon: Timer,
        route: '/admin/automation',
        minRole: 'moderator',
        group: 'Automation',
        keywords: ['cron', 'jobs', 'schedules'],
      },
      {
        id: 'pipelines',
        label: 'Pipelines & imports',
        icon: Workflow,
        route: '/admin/pipelines',
        adminOnly: true,
        group: 'Automation',
      },
      {
        id: 'search-intelligence',
        label: 'Search intelligence',
        icon: Search,
        route: '/admin/search-intelligence',
        adminOnly: true,
        group: 'Intelligence & graphs',
      },
      {
        // An ontology explorer over the content graph — data tooling, and it
        // reads a nightly snapshot, which is why it is not in Content.
        id: 'content-graph',
        label: 'Content graph',
        icon: Waypoints,
        route: '/admin/graph',
        adminOnly: true,
        group: 'Intelligence & graphs',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    defaultExpanded: false,
    minRole: 'admin',
    items: [
      {
        id: 'users',
        label: 'Users & roles',
        icon: UserCog,
        route: '/admin/users',
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        route: '/admin/analytics',
        group: 'Operations',
      },
      {
        id: 'audit-log',
        label: 'Audit log',
        icon: History,
        route: '/admin/audit',
        group: 'Operations',
      },
      {
        id: 'security',
        label: 'Security',
        icon: Shield,
        route: '/admin/security',
        group: 'Operations',
      },
      {
        id: 'cloudflare',
        label: 'Infrastructure',
        icon: Cloud,
        route: '/admin/cloudflare',
        group: 'Operations',
        keywords: ['cloudflare', 'hosting'],
      },
      {
        id: 'design',
        label: 'Design & branding',
        icon: Palette,
        route: '/admin/design',
        group: 'Configuration',
      },
      {
        // The editorial voice: rules, terminology and the few-shot examples the
        // content pipelines are calibrated on. Configuration rather than
        // Content, for the same reason Design & Branding is — it governs how
        // every entity is written, it is not an entity.
        id: 'styleguide',
        label: 'Editorial style',
        icon: SpellCheck,
        route: '/admin/styleguide',
        group: 'Configuration',
        keywords: ['styleguide', 'voice', 'terminology'],
      },
      {
        id: 'email',
        label: 'Email',
        icon: Send,
        route: '/admin/email',
        minRole: 'admin',
        group: 'Configuration',
        keywords: [
          'newsletter',
          'campaigns',
          'subscribers',
          'transactional',
          'templates',
          'designer',
        ],
      },
      {
        id: 'redirects',
        label: 'Redirects',
        icon: RouteIcon,
        route: '/admin/content/redirects',
        countTable: 'redirects',
        group: 'Configuration',
      },
    ],
  },
];

// ── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Find a nav item matching the given route across all sections.
 */
export function getNavItemByRoute(route: string): AdminNavItem | undefined {
  for (const section of adminNavSections) {
    const item = section.items.find((i) => i.route === route);
    if (item) return item;
  }
  return undefined;
}

/**
 * Resolve the minimum role required for a nav item, given its section.
 * Order: item.minRole → adminOnly?'admin' → section.minRole → 'editor'.
 */
export function resolveItemMinRole(item: AdminNavItem, section?: AdminNavSection): AdminRole {
  return item.minRole ?? (item.adminOnly ? 'admin' : (section?.minRole ?? 'editor'));
}

/**
 * Role floors for admin routes that have NO nav row of their own.
 *
 * **Longest-prefix inheritance only works when an ancestor route is actually in
 * the nav, and for these it is not.** `/admin/settings` carries
 * `minRole: 'moderator'` and a comment claiming it also covers "every
 * /admin/settings/* sub-page, via longest-prefix" — but each of those sub-pages
 * is a `<Navigate>` to `/admin/content/<vocab>`, whose longest nav prefix is
 * `/admin/content` → **editor**. The moderator gate protected the redirect stubs
 * and nothing behind them, so an editor had full vocabulary CRUD.
 *
 * The same shape exposed three tables the `adminOnly` Business console owns:
 * `/admin/business` is admin, while `/admin/content/hotels`,
 * `/admin/content/marketplace_brands` and `/admin/content/organizations` — the
 * raw lists for the console's own tabs — resolved to editor.
 *
 * These are routes, not nav items, because `content/:type` is a wildcard: the
 * page exists for every registry key whether or not anything links to it, and
 * `useContentListController` renders the "All Content" list rather than 404ing
 * for an unknown one. Gating therefore cannot be derived from the nav tree.
 *
 * Guarded by `src/config/__tests__/adminNavigation.test.ts`, which asserts every
 * reachable registry type resolves above the console floor or is listed here
 * deliberately.
 */
export const ADMIN_ROUTE_ROLE_OVERRIDES: Record<string, AdminRole> = {
  '/admin/email-templates': 'admin',
  '/admin/diagnostics': 'moderator',
  '/admin/governance': 'moderator',
  '/admin/editorial-tools': 'admin',
  '/admin/settings': 'moderator',
  '/admin/business': 'admin',
  // Controlled vocabularies — the tier the "Vocabularies" nav row intends.
  '/admin/content/venue_services': 'moderator',
  '/admin/content/event_types': 'moderator',
  '/admin/content/event_amenities': 'moderator',
  '/admin/content/event_services': 'moderator',
  '/admin/content/accessibility_attributes': 'moderator',
  '/admin/content/target_groups': 'moderator',
  '/admin/content/professions': 'moderator',
  '/admin/content/amenities': 'moderator',
  '/admin/content/event_categories': 'moderator',
  '/admin/content/news_categories': 'moderator',
  '/admin/content/marketplace_categories': 'moderator',
  '/admin/content/tag_categories': 'moderator',
  '/admin/content/kink_categories': 'moderator',
  '/admin/content/kink_items': 'moderator',
  '/admin/content/taxonomy_terms': 'moderator',
  '/admin/content/competitions': 'moderator',

  // Business-console tables — the tier /admin/business already carries.
  '/admin/content/hotels': 'admin',
  '/admin/content/marketplace_brands': 'admin',
  '/admin/content/organizations': 'admin',

  // Deep-link-only triage pages, matching their adminQueues.ts definitions.
  // Membership decisions remain moderator-only within the Groups workspace.
  '/admin/content/community_groups/requests': 'moderator',
  '/admin/content/group-requests': 'moderator',
  '/admin/content/liveness': 'moderator',
  '/admin/content/event-quality': 'moderator',
};

/**
 * Minimum role to access a pathname, for AdminShell's per-route enforcement.
 * Uses longest-prefix matching so sub-routes (e.g. /admin/settings/venue-services)
 * inherit the tier of their nearest configured nav item (/admin/settings).
 * Unknown admin routes default to 'editor' (the console entry floor).
 *
 * `ADMIN_ROUTE_ROLE_OVERRIDES` is combined by taking the **stricter** of the two,
 * never by replacing the nav-derived answer. An override can then only ever
 * tighten a route, so adding one cannot accidentally open a page that the nav
 * tree already restricts — the failure mode this whole table exists to fix.
 */
export function getRouteMinRole(pathname: string): AdminRole {
  let best: { item: AdminNavItem; section: AdminNavSection; len: number } | null = null;
  for (const section of adminNavSections) {
    for (const item of section.items) {
      const exact = pathname === item.route;
      const prefix = item.route !== '/admin' && pathname.startsWith(item.route + '/');
      if ((exact || prefix) && (!best || item.route.length > best.len)) {
        best = { item, section, len: item.route.length };
      }
    }
  }
  const fromNav: AdminRole = best ? resolveItemMinRole(best.item, best.section) : 'editor';

  // Longest matching override, so a future prefix entry behaves like a nav row.
  let override: AdminRole | undefined;
  let overrideLen = -1;
  for (const [route, role] of Object.entries(ADMIN_ROUTE_ROLE_OVERRIDES)) {
    const matches = pathname === route || pathname.startsWith(route + '/');
    if (matches && route.length > overrideLen) {
      override = role;
      overrideLen = route.length;
    }
  }

  if (!override) return fromNav;
  return ROLE_RANK[override] > ROLE_RANK[fromNav] ? override : fromNav;
}

/**
 * Build a breadcrumb array from a pathname.
 * e.g. `/admin/content/venues` =>
 *   [{ label: 'Admin Console', route: '/admin' }, { label: 'Content', route: '/admin/content' }, { label: 'Venues' }]
 */
export function getBreadcrumbsForRoute(pathname: string): Array<{ label: string; route?: string }> {
  const crumbs: Array<{ label: string; route?: string }> = [
    { label: 'Admin Console', route: '/admin' },
  ];

  // Match only whole path segments and prefer the nearest destination.
  let best: { item: AdminNavItem; section: AdminNavSection } | undefined;
  for (const section of adminNavSections) {
    for (const item of section.items) {
      const matches =
        pathname === item.route ||
        (item.route !== '/admin' && pathname.startsWith(item.route + '/'));
      if (matches && (!best || item.route.length > best.item.route.length)) {
        best = { item, section };
      }
    }
  }
  if (best) {
    if (best.section.id !== 'cockpit') {
      crumbs.push({ label: best.section.label, route: best.section.items[0]?.route });
    }
    crumbs.push({ label: best.item.label });
  }

  return crumbs;
}

/**
 * Build an uppercase eyebrow string for a route, e.g. "CONTENT · VENUES".
 * Derived from the breadcrumb resolver (last two labels, minus "Admin Console").
 * Used as the default `eyebrow` for AdminPageHeader so pages only supply a title.
 */
export function getEyebrowForRoute(pathname: string): string | undefined {
  const crumbs = getBreadcrumbsForRoute(pathname)
    .filter((c) => c.label !== 'Admin Console')
    .map((c) => c.label);
  if (crumbs.length === 0) return undefined;
  return crumbs.slice(-2).join(' · ').toUpperCase();
}

/**
 * Returns all nav items that have a `countTable` configured.
 * Useful for batch-fetching row counts from Supabase.
 */
export function getAllCountTables(): Array<{ id: string; table: string }> {
  const result: Array<{ id: string; table: string }> = [];
  for (const section of adminNavSections) {
    for (const item of section.items) {
      if (item.countTable) {
        result.push({ id: item.id, table: item.countTable });
      }
    }
  }
  return result;
}
