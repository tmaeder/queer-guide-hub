/**
 * Admin Navigation Configuration
 * Simplified 4-section layout: Cockpit, Content, Import & Review, System (Review & Moderation merged into Import & Review).
 * Central config for the unified admin sidebar. Each section groups related nav items.
 * Used by AdminSidebar to render the navigation tree.
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
  Users,
  MapPin,
  Globe,
  Tag,
  ShoppingBag,
  BookOpen,
  UsersRound,
  FileText,
  Image,
  Download,
  ClipboardCheck,
  Settings,
  Mail,
  Link2,
  Handshake,
  Workflow,
  Filter,
  Hotel,
  Home,
  History,
  MessageSquarePlus,
  Search,
  Flag,
  Award,
  CopyCheck,
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
  /** If true, this section is collapsible and starts expanded */
  collapsible?: boolean;
  defaultExpanded?: boolean;
  /** Default minimum role for items in this section (item-level wins). */
  minRole?: AdminRole;
  items: AdminNavItem[];
}

// ── Navigation Sections ────────────────────────────────────────────────────────

export const adminNavSections: AdminNavSection[] = [
  // ── Cockpit (dashboard + daily work) ────────────────────────────
  {
    id: 'cockpit',
    label: 'Cockpit',
    icon: LayoutDashboard,
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
        id: 'review-queue',
        label: 'Review Queue',
        icon: ClipboardCheck,
        route: '/admin/review',
      },
      {
        id: 'feedback',
        label: 'Feedback',
        icon: MessageSquarePlus,
        route: '/admin/feedback',
        reviewCountKey: 'review_feedback',
      },
      {
        id: 'affiliate',
        label: 'Affiliate',
        icon: Handshake,
        route: '/admin/affiliate',
        adminOnly: true,
      },
    ],
  },

  // ── Content (grouped: Places · People · Editorial · Taxonomy & Media)
  //    Quality lives as a tab on each entity page (?tab=quality), not as a
  //    sibling row — routes preserved in routes.tsx for deep-links. ──────
  {
    id: 'content',
    label: 'Content',
    icon: Layers,
    collapsible: true,
    defaultExpanded: true,
    minRole: 'editor',
    items: [
      {
        id: 'all-content',
        label: 'All Content',
        icon: Layers,
        route: '/admin/content',
      },
      // Places
      {
        id: 'venues',
        label: 'Venues',
        icon: Building,
        route: '/admin/content/venues',
        countTable: 'venues',
        group: 'Places',
      },
      {
        id: 'duplicates',
        label: 'Duplicate venues',
        icon: CopyCheck,
        route: '/admin/duplicates',
        group: 'Places',
      },
      {
        id: 'events',
        label: 'Events',
        icon: Calendar,
        route: '/admin/content/events',
        countTable: 'events',
        group: 'Places',
      },
      {
        id: 'cities',
        label: 'Cities',
        icon: MapPin,
        route: '/admin/content/cities',
        countTable: 'cities',
        group: 'Places',
      },
      {
        id: 'countries',
        label: 'Countries',
        icon: Globe,
        route: '/admin/content/countries',
        countTable: 'countries',
        group: 'Places',
      },
      {
        id: 'hotels',
        label: 'Hotels & BnBs',
        icon: Hotel,
        route: '/admin/content/hotels',
        countTable: 'hotels',
        group: 'Places',
      },
      {
        id: 'villages',
        label: 'Queer Villages',
        icon: Home,
        route: '/admin/content/queer_villages',
        countTable: 'queer_villages',
        group: 'Places',
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
        id: 'groups',
        label: 'Groups',
        icon: UsersRound,
        route: '/admin/content/community_groups',
        countTable: 'community_groups',
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
        id: 'marketplace-guides',
        label: 'Marketplace Guides',
        icon: BookOpen,
        route: '/admin/marketplace/guides',
        countTable: 'marketplace_guides',
        group: 'Editorial',
      },
      {
        id: 'venue-guides',
        label: 'Venue Guides',
        icon: BookOpen,
        route: '/admin/venue-guides',
        countTable: 'venue_guides',
        group: 'Editorial',
      },
      {
        id: 'quests',
        label: 'Editorial Quests',
        icon: Flag,
        route: '/admin/quests',
        countTable: 'quests',
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
      // Taxonomy & Media
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: ShoppingBag,
        route: '/admin/content/marketplace_listings',
        countTable: 'marketplace_listings',
        group: 'Taxonomy & Media',
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        route: '/admin/content/unified_tags',
        countTable: 'unified_tags',
        group: 'Taxonomy & Media',
      },
      {
        id: 'media-library',
        label: 'Media Library',
        icon: Image,
        route: '/admin/media',
        group: 'Taxonomy & Media',
      },
    ],
  },

  // ── Import & Data (ingestion + automation) ──────────────────────
  {
    id: 'import-data',
    label: 'Import & Data',
    icon: Download,
    collapsible: true,
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
        id: 'email-ingestions',
        label: 'Email Ingestions',
        icon: Mail,
        route: '/admin/imports/email-ingestions',
        countTable: 'email_ingestions',
      },
      {
        id: 'automation',
        label: 'Automations',
        icon: Workflow,
        route: '/admin/automation',
        minRole: 'moderator',
      },
      {
        id: 'pipelines',
        label: 'Pipelines',
        icon: Workflow,
        route: '/admin/pipelines',
        adminOnly: true,
      },
      {
        id: 'ingestion-rules',
        label: 'Ingestion Rules',
        icon: Filter,
        route: '/admin/ingestion-rules',
        adminOnly: true,
      },
      {
        id: 'search-intelligence',
        label: 'Search Intelligence',
        icon: Search,
        route: '/admin/search-intelligence',
        adminOnly: true,
      },
    ],
  },

  // ── System (admin-only) ─────────────────────────────────────────
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    collapsible: true,
    defaultExpanded: false,
    minRole: 'moderator',
    items: [
      {
        id: 'users',
        label: 'Users & Roles',
        icon: Users,
        route: '/admin/users',
        adminOnly: true,
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        route: '/admin/analytics',
        adminOnly: true,
      },
      {
        id: 'maps',
        label: 'Maps',
        icon: MapPin,
        route: '/admin/maps',
        adminOnly: true,
      },
      {
        id: 'security',
        label: 'Security',
        icon: Shield,
        route: '/admin/security',
        adminOnly: true,
      },
      {
        id: 'cloudflare',
        label: 'Cloudflare',
        icon: Cloud,
        route: '/admin/cloudflare',
        adminOnly: true,
      },
      {
        id: 'affiliates',
        label: 'Affiliates',
        icon: Handshake,
        route: '/admin/affiliates',
        adminOnly: true,
      },
      {
        id: 'redirects',
        label: 'Redirects',
        icon: Link2,
        route: '/admin/redirects',
        adminOnly: true,
        countTable: 'redirects',
      },
      {
        id: 'email-templates',
        label: 'Email Templates',
        icon: Mail,
        route: '/admin/email-templates',
        adminOnly: true,
      },
      {
        id: 'recognition',
        label: 'Recognition Wall',
        icon: Award,
        route: '/admin/recognition',
        adminOnly: true,
      },
      {
        id: 'audit-log',
        label: 'Audit Log',
        icon: History,
        route: '/admin/audit',
        adminOnly: true,
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        route: '/admin/settings',
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
  return item.minRole ?? (item.adminOnly ? 'admin' : section?.minRole ?? 'editor');
}

/**
 * Minimum role to access a pathname, for AdminShell's per-route enforcement.
 * Uses longest-prefix matching so sub-routes (e.g. /admin/settings/venue-categories)
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
