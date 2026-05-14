/**
 * Admin Navigation Configuration
 * Simplified 4-section layout: Cockpit, Content, Import & Review, System (Review & Moderation merged into Import & Review).
 * Central config for the unified admin sidebar. Each section groups related nav items.
 * Used by AdminSidebar to render the navigation tree.
 */

import {
  LayoutDashboard,
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  /** Whether this item requires admin role (not just moderator) */
  adminOnly?: boolean;
}

export interface AdminNavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** If true, this section is collapsible and starts expanded */
  collapsible?: boolean;
  defaultExpanded?: boolean;
  items: AdminNavItem[];
}

// ── Navigation Sections ────────────────────────────────────────────────────────

export const adminNavSections: AdminNavSection[] = [
  // ── Cockpit (unified dashboard) ─────────────────────────────────
  {
    id: 'cockpit',
    label: 'Cockpit',
    icon: LayoutDashboard,
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboard,
        route: '/admin',
      },
    ],
  },

  // ── Content (all content types unified) ─────────────────────────
  {
    id: 'content',
    label: 'Content',
    icon: Layers,
    collapsible: true,
    defaultExpanded: true,
    items: [
      {
        id: 'all-content',
        label: 'All Content',
        icon: Layers,
        route: '/admin/content',
      },
      {
        id: 'venues',
        label: 'Venues',
        icon: Building,
        route: '/admin/content/venues',
        countTable: 'venues',
      },
      {
        id: 'events',
        label: 'Events',
        icon: Calendar,
        route: '/admin/content/events',
        countTable: 'events',
      },
      {
        id: 'news',
        label: 'News',
        icon: Newspaper,
        route: '/admin/content/news_articles',
        countTable: 'news_articles',
      },
      {
        id: 'personalities',
        label: 'Personalities',
        icon: Users,
        route: '/admin/content/personalities',
        countTable: 'personalities',
      },
      {
        id: 'cities',
        label: 'Cities',
        icon: MapPin,
        route: '/admin/content/cities',
        countTable: 'cities',
      },
      {
        id: 'countries',
        label: 'Countries',
        icon: Globe,
        route: '/admin/content/countries',
        countTable: 'countries',
      },
      {
        id: 'hotels',
        label: 'Hotels & BnBs',
        icon: Hotel,
        route: '/admin/content/hotels',
        countTable: 'hotels',
      },
      {
        id: 'villages',
        label: 'Queer Villages',
        icon: Home,
        route: '/admin/content/queer_villages',
        countTable: 'queer_villages',
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: ShoppingBag,
        route: '/admin/content/marketplace_listings',
        countTable: 'marketplace_listings',
      },
      {
        id: 'groups',
        label: 'Groups',
        icon: UsersRound,
        route: '/admin/content/community_groups',
        countTable: 'community_groups',
      },
      {
        id: 'quests',
        label: 'Editorial Quests',
        icon: Flag,
        route: '/admin/quests',
        countTable: 'quests',
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        route: '/admin/content/unified_tags',
        countTable: 'unified_tags',
      },
      {
        id: 'pages',
        label: 'Pages',
        icon: FileText,
        route: '/admin/content/cms_pages',
        countTable: 'cms_pages',
      },
      {
        id: 'media-library',
        label: 'Media Library',
        icon: Image,
        route: '/admin/media',
      },
    ],
  },

  // ── Import & Review (combined pipeline) ─────────────────────────
  {
    id: 'import-review',
    label: 'Import & Review',
    icon: Download,
    collapsible: true,
    defaultExpanded: true,
    items: [
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
        id: 'pipelines',
        label: 'Pipelines',
        icon: Workflow,
        route: '/admin/pipelines',
        adminOnly: true,
      },
      {
        id: 'email-ingestions',
        label: 'Email Ingestions',
        icon: Mail,
        route: '/admin/imports/email-ingestions',
        countTable: 'email_ingestions',
      },
      {
        id: 'ingestion-rules',
        label: 'Ingestion Rules',
        icon: Filter,
        route: '/admin/ingestion-rules',
        adminOnly: true,
      },
      {
        id: 'ingestion-rules',
        label: 'Ingestion Rules',
        icon: Filter,
        route: '/admin/ingestion-rules',
        adminOnly: true,
        color: '#8b5cf6',
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
        id: 'search-intelligence',
        label: 'Search Intelligence',
        icon: Search,
        route: '/admin/search-intelligence',
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
