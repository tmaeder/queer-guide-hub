/**
 * Admin Navigation Configuration
 * Four-section layout: Cockpit (the daily driver — dashboard + every queue),
 * Content (what the site is made of), Data (how it gets in and stays clean),
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
  Briefcase,
  Calendar,
  Newspaper,
  Users,
  UserCog,
  MapPin,
  Map,
  Globe,
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
  MailOpen,
  MailCheck,
  Contact,
  Route as RouteIcon,
  Handshake,
  Workflow,
  Timer,
  Home,
  History,
  MessageSquarePlus,
  Search,
  Palette,
  Award,
  Trophy,
  CopyCheck,
  PenLine,
  UserPlus,
  ShieldCheck,
  Waypoints,
  Network,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminRole } from '@/config/adminRoles';

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
   *  declaration order. Items without a group render above the first group. */
  group?: string;
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
  // ── Cockpit — the daily driver. Every queue an editor works lives here, in
  //    the order they are worked: what arrived, what is wrong, what people
  //    said. The old Cockpit/Review split put `Postfach` and `Inbox` — two
  //    near-synonyms — in different sections either side of a divider. ──────
  {
    id: 'cockpit',
    label: 'Cockpit',
    icon: LayoutDashboard,
    defaultExpanded: true,
    minRole: 'editor',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboard,
        route: '/admin',
      },
      {
        id: 'inbox',
        label: 'Inbox',
        icon: Inbox,
        route: '/admin/inbox',
      },
      {
        id: 'postfach',
        label: 'Postfach',
        icon: Mail,
        route: '/admin/postfach',
      },
      {
        id: 'quality',
        label: 'Quality',
        icon: ShieldCheck,
        route: '/admin/quality',
      },
      {
        // Sits next to Quality, not under Data: the Quality hub already carries
        // the Duplicates card and the nightly sweep's queue is an inbox queue.
        id: 'duplicates',
        label: 'Duplicates & merge',
        icon: CopyCheck,
        route: '/admin/duplicates',
      },
      {
        id: 'feedback',
        label: 'Feedback',
        icon: MessageSquarePlus,
        route: '/admin/feedback',
        reviewCountKey: 'review_feedback',
      },
    ],
  },

  // ── Content — what the site is made of, grouped by kind:
  //    Places & Events · Geography · People · Editorial · Commerce ·
  //    Taxonomy & Media. Groups are ordered by how often an editor opens
  //    them, not alphabetically. ──────
  {
    id: 'content',
    label: 'Content',
    icon: Layers,
    defaultExpanded: true,
    minRole: 'editor',
    items: [
      {
        id: 'all-content',
        label: 'All Content',
        icon: Layers,
        route: '/admin/content',
      },
      // Places & Events — the two highest-traffic content types.
      {
        id: 'venues',
        label: 'Venues',
        icon: Building,
        route: '/admin/content/venues',
        countTable: 'venues',
        group: 'Places & Events',
      },
      {
        id: 'events',
        label: 'Events',
        icon: Calendar,
        route: '/admin/content/events',
        countTable: 'events',
        group: 'Places & Events',
      },
      // Geography — the spine, top-down. Geography (the tree) leads because it
      // is the surface you re-parent and merge from; the typed tables follow.
      {
        id: 'geography',
        label: 'Geography',
        icon: Network,
        route: '/admin/geography',
        group: 'Geography',
      },
      {
        id: 'countries',
        label: 'Countries',
        icon: Globe,
        route: '/admin/content/countries',
        countTable: 'countries',
        group: 'Geography',
      },
      {
        id: 'cities',
        label: 'Cities',
        icon: MapPin,
        route: '/admin/content/cities',
        countTable: 'cities',
        group: 'Geography',
      },
      {
        id: 'villages',
        label: 'Queer Villages',
        icon: Home,
        route: '/admin/content/queer_villages',
        countTable: 'queer_villages',
        group: 'Geography',
      },
      // People
      {
        id: 'personalities',
        label: 'Personalities',
        icon: Users,
        route: '/admin/content/personalities',
        countTable: 'personalities',
        group: 'People',
      },
      {
        id: 'milestones',
        label: 'Milestones',
        icon: Award,
        route: '/admin/content/milestones',
        countTable: 'milestones',
        group: 'People',
      },
      {
        id: 'groups',
        label: 'Groups',
        icon: UsersRound,
        route: '/admin/content/community_groups',
        countTable: 'community_groups',
        group: 'People',
      },
      {
        id: 'group-requests',
        label: 'Group Requests',
        icon: UserPlus,
        route: '/admin/content/group-requests',
        reviewCountKey: 'review_group_requests',
        group: 'People',
      },
      {
        // Community content, not a system setting — it was in System only
        // because nothing else claimed it.
        id: 'recognition',
        label: 'Recognition Wall',
        icon: Trophy,
        route: '/admin/recognition',
        adminOnly: true,
        group: 'People',
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
        id: 'guides',
        label: 'Guides',
        icon: BookOpen,
        route: '/admin/content/guides',
        countTable: 'guides',
        group: 'Editorial',
      },
      {
        id: 'places-editorial',
        label: 'Editorial Drafts',
        icon: PenLine,
        route: '/admin/places-editorial',
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
      // Commerce — Business and Affiliate are commerce consoles, not cockpit
      // dashboards; both were in Cockpit only as spine-unification residue.
      // Vendors, Brands and Hotels are TABS of the Business console, so they
      // get no nav row of their own; their old routes redirect there.
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: ShoppingBag,
        route: '/admin/content/marketplace_listings',
        countTable: 'marketplace_listings',
        group: 'Commerce',
      },
      {
        id: 'business',
        label: 'Business',
        icon: Briefcase,
        route: '/admin/business',
        // No review badge: link review lives on /admin/quality with the other gates.
        adminOnly: true,
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
      // Taxonomy & Media — `Vocabularies` (/admin/settings) was labelled
      // "Taxonomies" under a gear icon at the bottom of System, three sections
      // away from Tags. It is the same job: controlled vocabulary CRUD.
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        route: '/admin/content/unified_tags',
        countTable: 'unified_tags',
        group: 'Taxonomy & Media',
      },
      {
        id: 'settings',
        label: 'Vocabularies',
        icon: ListTree,
        route: '/admin/settings',
        // Explicit, not inherited: this row used to sit in System and take that
        // section's `moderator` floor. Content's floor is `editor`, so without
        // this the move would silently open taxonomy CRUD (and every
        // /admin/settings/* sub-page, via longest-prefix) to editors.
        minRole: 'moderator',
        group: 'Taxonomy & Media',
      },
      {
        id: 'media-library',
        label: 'Media & Assets',
        icon: Image,
        route: '/admin/media',
        group: 'Taxonomy & Media',
      },
    ],
  },

  // ── Data — how content gets in and stays healthy. Ingestion first, then the
  //    machinery that runs over it. `Import data` leads because Pipelines is
  //    adminOnly and a section must not lead with an item its own minRole
  //    cannot open (the breadcrumb links there). ──────
  {
    id: 'data',
    label: 'Data',
    icon: Download,
    defaultExpanded: true,
    minRole: 'editor',
    items: [
      {
        id: 'import-data-hub',
        label: 'Import data',
        icon: Download,
        route: '/admin/imports/data',
      },
      {
        id: 'pipelines',
        label: 'Pipelines',
        icon: Workflow,
        route: '/admin/pipelines',
        adminOnly: true,
      },
      {
        id: 'email-ingestions',
        label: 'Email Ingestions',
        icon: MailOpen,
        route: '/admin/imports/email-ingestions',
        countTable: 'email_ingestions',
      },
      {
        // An integration, not a content type — it used to sit in slot #2 of
        // Content, above every real entity.
        id: 'twenty-crm',
        label: 'Twenty CRM',
        icon: Contact,
        route: '/admin/content/twenty-crm',
      },
      {
        // The cron / job registry that drives every engine above it.
        id: 'automation',
        label: 'Automations',
        icon: Timer,
        route: '/admin/automation',
        minRole: 'moderator',
      },
      {
        id: 'search-intelligence',
        label: 'Search Intelligence',
        icon: Search,
        route: '/admin/search-intelligence',
        adminOnly: true,
      },
      {
        // An ontology explorer over the content graph — data tooling, and it
        // reads a nightly snapshot, which is why it is not in Content.
        id: 'content-graph',
        label: 'Content Graph',
        icon: Waypoints,
        route: '/admin/graph',
        adminOnly: true,
      },
    ],
  },

  // ── System — admin-only. Two jobs only: watch the platform (Operations) and
  //    configure it (Configuration). Everything that was merely unclaimed
  //    moved out: Automations + Content Graph → Data, Recognition Wall →
  //    Content · People, Taxonomies → Content · Taxonomy & Media. ──────
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    defaultExpanded: false,
    minRole: 'admin',
    items: [
      // Operations
      {
        id: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        route: '/admin/analytics',
        group: 'Operations',
      },
      {
        id: 'audit-log',
        label: 'Audit Log',
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
        label: 'Cloudflare',
        icon: Cloud,
        route: '/admin/cloudflare',
        group: 'Operations',
      },
      // Configuration
      {
        id: 'users',
        label: 'Users & Roles',
        icon: UserCog,
        route: '/admin/users',
        group: 'Configuration',
      },
      {
        id: 'design',
        label: 'Design & Branding',
        icon: Palette,
        route: '/admin/design',
        group: 'Configuration',
      },
      {
        id: 'email-templates',
        label: 'Email Templates',
        icon: MailCheck,
        route: '/admin/email-templates',
        group: 'Configuration',
      },
      {
        id: 'redirects',
        label: 'Redirects',
        icon: RouteIcon,
        route: '/admin/content/redirects',
        countTable: 'redirects',
        group: 'Configuration',
      },
      {
        id: 'maps',
        label: 'Maps',
        icon: Map,
        route: '/admin/maps',
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
 * Minimum role to access a pathname, for AdminShell's per-route enforcement.
 * Uses longest-prefix matching so sub-routes (e.g. /admin/settings/venue-services)
 * inherit the tier of their nearest configured nav item (/admin/settings).
 * Unknown admin routes default to 'editor' (the console entry floor).
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
  return best ? resolveItemMinRole(best.item, best.section) : 'editor';
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

  // Find the section and item that match this pathname
  for (const section of adminNavSections) {
    for (const item of section.items) {
      if (item.route === pathname) {
        if (section.id !== 'cockpit') {
          const sectionRoute = section.items[0]?.route;
          crumbs.push({ label: section.label, route: sectionRoute });
        }
        crumbs.push({ label: item.label });
        return crumbs;
      }
    }
  }

  // Fallback: if no exact match, try to match by section
  for (const section of adminNavSections) {
    for (const item of section.items) {
      if (pathname.startsWith(item.route) && item.route !== '/admin') {
        if (section.id !== 'cockpit') {
          const sectionRoute = section.items[0]?.route;
          crumbs.push({ label: section.label, route: sectionRoute });
        }
        crumbs.push({ label: item.label });
        return crumbs;
      }
    }
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
