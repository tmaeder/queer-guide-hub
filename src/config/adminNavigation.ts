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
  Inbox,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { brandColors } from '@/theme/muiTheme';

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
  /** Accent color for active state */
  color?: string;
}

export interface AdminNavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
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
    color: brandColors.main,
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboard,
        route: '/admin',
        color: brandColors.main,
      },
    ],
  },

  // ── Content (all content types unified) ─────────────────────────
  {
    id: 'content',
    label: 'Content',
    icon: Layers,
    color: brandColors.main,
    collapsible: true,
    defaultExpanded: true,
    items: [
      {
        id: 'all-content',
        label: 'All Content',
        icon: Layers,
        route: '/admin/content',
        color: brandColors.main,
      },
      {
        id: 'venues',
        label: 'Venues',
        icon: Building,
        route: '/admin/content/venues',
        countTable: 'venues',
        color: brandColors.main,
      },
      {
        id: 'events',
        label: 'Events',
        icon: Calendar,
        route: '/admin/content/events',
        countTable: 'events',
        color: '#ec4899',
      },
      {
        id: 'news',
        label: 'News',
        icon: Newspaper,
        route: '/admin/content/news_articles',
        countTable: 'news_articles',
        color: '#3b82f6',
      },
      {
        id: 'personalities',
        label: 'Personalities',
        icon: Users,
        route: '/admin/content/personalities',
        countTable: 'personalities',
        color: '#f59e0b',
      },
      {
        id: 'cities',
        label: 'Cities',
        icon: MapPin,
        route: '/admin/content/cities',
        countTable: 'cities',
        color: '#10b981',
      },
      {
        id: 'countries',
        label: 'Countries',
        icon: Globe,
        route: '/admin/content/countries',
        countTable: 'countries',
        color: '#6366f1',
      },
      {
        id: 'hotels',
        label: 'Hotels & BnBs',
        icon: Hotel,
        route: '/admin/content/hotels',
        countTable: 'hotels',
        color: '#0ea5e9',
      },
      {
        id: 'villages',
        label: 'Queer Villages',
        icon: Home,
        route: '/admin/content/queer_villages',
        countTable: 'queer_villages',
        color: '#d946ef',
      },
      {
        id: 'marketplace',
        label: 'Marketplace',
        icon: ShoppingBag,
        route: '/admin/content/marketplace_listings',
        countTable: 'marketplace_listings',
        color: '#f97316',
      },
      {
        id: 'groups',
        label: 'Groups',
        icon: UsersRound,
        route: '/admin/content/community_groups',
        countTable: 'community_groups',
        color: '#a855f7',
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        route: '/admin/content/unified_tags',
        countTable: 'unified_tags',
        color: '#14b8a6',
      },
      {
        id: 'pages',
        label: 'Pages',
        icon: FileText,
        route: '/admin/content/cms_pages',
        countTable: 'cms_pages',
        color: '#64748b',
      },
      {
        id: 'media-library',
        label: 'Media Library',
        icon: Image,
        route: '/admin/media',
        color: '#3b82f6',
      },
    ],
  },

  // ── Import & Review (combined pipeline) ─────────────────────────
  {
    id: 'import-review',
    label: 'Import & Review',
    icon: Download,
    color: '#10b981',
    collapsible: true,
    defaultExpanded: true,
    items: [
      {
        id: 'review-queue',
        label: 'Review Queue',
        icon: ClipboardCheck,
        route: '/admin/review',
        color: '#f59e0b',
      },
      {
        id: 'feedback',
        label: 'Feedback',
        icon: MessageSquarePlus,
        route: '/admin/feedback',
        reviewCountKey: 'review_feedback',
        color: '#DB2777',
      },
      {
        id: 'pipelines',
        label: 'Pipelines',
        icon: Workflow,
        route: '/admin/pipelines',
        adminOnly: true,
        color: '#6366f1',
      },
      {
        id: 'email-ingestions',
        label: 'Email Ingestions',
        icon: Mail,
        route: '/admin/imports/email-ingestions',
        countTable: 'email_ingestions',
        color: '#ec4899',
      },
      {
        id: 'ingestion-rules',
        label: 'Ingestion Rules',
        icon: Filter,
        route: '/admin/ingestion-rules',
        adminOnly: true,
        color: '#8b5cf6',
      },
      {
        id: 'user-submissions',
        label: 'Extension Submissions',
        icon: Inbox,
        route: '/admin/user-submissions',
        adminOnly: true,
        color: '#d4007f',
      },
    ],
  },

  // ── System (admin-only) ─────────────────────────────────────────
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    color: '#64748b',
    collapsible: true,
    defaultExpanded: false,
    items: [
      {
        id: 'users',
        label: 'Users & Roles',
        icon: Users,
        route: '/admin/users',
        adminOnly: true,
        color: '#64748b',
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        route: '/admin/analytics',
        adminOnly: true,
        color: '#3b82f6',
      },
      {
        id: 'security',
        label: 'Security',
        icon: Shield,
        route: '/admin/security',
        adminOnly: true,
        color: '#ef4444',
      },
      {
        id: 'cloudflare',
        label: 'Cloudflare',
        icon: Cloud,
        route: '/admin/cloudflare',
        adminOnly: true,
        color: '#f59e0b',
      },
      {
        id: 'affiliates',
        label: 'Affiliates',
        icon: Handshake,
        route: '/admin/affiliates',
        adminOnly: true,
        color: '#10b981',
      },
      {
        id: 'redirects',
        label: 'Redirects',
        icon: Link2,
        route: '/admin/redirects',
        adminOnly: true,
        countTable: 'redirects',
        color: brandColors.main,
      },
      {
        id: 'email-templates',
        label: 'Email Templates',
        icon: Mail,
        route: '/admin/email-templates',
        adminOnly: true,
        color: '#64748b',
      },
      {
        id: 'audit-log',
        label: 'Audit Log',
        icon: History,
        route: '/admin/audit',
        adminOnly: true,
        color: '#6366f1',
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        route: '/admin/settings',
        color: '#64748b',
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
