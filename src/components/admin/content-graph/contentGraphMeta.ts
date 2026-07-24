import {
  Building, Calendar, Users, Newspaper, ShoppingBag, Hotel, Handshake,
  History, MapPin, Globe, Map, Home, PartyPopper, UsersRound, Tag, Image,
  type LucideIcon,
} from 'lucide-react';
import { monoChartPalette } from '@/lib/chartPalette';

/** Foreground token as a concrete color string, sourced from the allowlisted
 *  chart palette so no raw hsl() literal lives in this tree. */
export const GRAPH_STROKE = monoChartPalette(1)[0];

export type GraphCategory = 'content' | 'geo' | 'community' | 'taxonomy' | 'media';

export interface GraphNodeStat {
  type: string;
  label: string;
  category: GraphCategory;
  count: number;
  orphan_count: number | null;
  dup_count: number;
}

export interface GraphEdgeStat {
  source: string;
  target: string;
  relation: string;
  relation_kind: 'geo' | 'structural' | 'tag' | 'ontology' | 'cross' | 'media';
  count: number;
}

export interface ContentGraphSnapshot {
  nodes: GraphNodeStat[];
  edges: GraphEdgeStat[];
  generated_at: string;
}

/** Per-type presentation + drill metadata. `table`/`titleCol` gate the
 *  instance explorer — types without them show stats only. */
export interface TypeMeta {
  icon: LucideIcon;
  /** Supabase table for the instance record picker (null = no picker). */
  table: string | null;
  titleCol: string;
  /** Admin route for this type's list/dashboard. */
  adminHref: string;
}

export const TYPE_META: Record<string, TypeMeta> = {
  venue: { icon: Building, table: 'venues', titleCol: 'name', adminHref: '/admin/content/venue-quality' },
  event: { icon: Calendar, table: 'events', titleCol: 'title', adminHref: '/admin/content/event-quality' },
  personality: { icon: Users, table: 'personalities', titleCol: 'name', adminHref: '/admin/content/personality-quality' },
  news: { icon: Newspaper, table: 'news_articles', titleCol: 'title', adminHref: '/admin/content' },
  marketplace: { icon: ShoppingBag, table: 'marketplace_listings', titleCol: 'title', adminHref: '/admin/content/marketplace-quality' },
  hotel: { icon: Hotel, table: 'hotels', titleCol: 'name', adminHref: '/admin/content' },
  organization: { icon: Handshake, table: 'organizations', titleCol: 'name', adminHref: '/admin/content' },
  milestone: { icon: History, table: 'milestones', titleCol: 'title', adminHref: '/admin/content/milestones' },
  city: { icon: MapPin, table: 'cities', titleCol: 'name', adminHref: '/admin/content/city-quality' },
  country: { icon: Globe, table: 'countries', titleCol: 'name', adminHref: '/admin/content' },
  continent: { icon: Globe, table: null, titleCol: 'name', adminHref: '/admin/content' },
  region: { icon: Map, table: null, titleCol: 'name', adminHref: '/admin/content' },
  village: { icon: Home, table: 'queer_villages', titleCol: 'name', adminHref: '/admin/content/village-quality' },
  festival: { icon: PartyPopper, table: null, titleCol: 'name', adminHref: '/admin/content' },
  group: { icon: UsersRound, table: null, titleCol: 'name', adminHref: '/admin/content' },
  tag: { icon: Tag, table: null, titleCol: 'name', adminHref: '/admin/tags' },
  image: { icon: Image, table: null, titleCol: 'name', adminHref: '/admin/content/media' },
};

export function typeMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? { icon: Tag, table: null, titleCol: 'name', adminHref: '/admin/content' };
}

/** Stroke pattern per relationship class — monochrome, distinguished by dash
 *  (never hue). FK backbone solid; taxonomy dashed; cross/media dotted. */
export function edgeDash(kind: GraphEdgeStat['relation_kind']): string {
  switch (kind) {
    case 'geo':
    case 'structural': return '';
    case 'tag':
    case 'ontology': return '6 4';
    case 'cross': return '2 3';
    case 'media': return '1 4';
    default: return '';
  }
}

export const EDGE_KIND_LABEL: Record<GraphEdgeStat['relation_kind'], string> = {
  geo: 'Geo (foreign key)',
  structural: 'Structural (foreign key)',
  tag: 'Tag assignment',
  ontology: 'Tag ontology',
  cross: 'Cross-entity link',
  media: 'Media / image',
};

/** Edge stroke width from link count (log scale, clamped). */
export function edgeWidth(count: number): number {
  return Math.max(1, Math.min(7, Math.log10(Math.max(1, count)) * 1.4));
}

/** Stable id for an edge (source→target→relation). */
export function edgeId(e: GraphEdgeStat): string {
  return `${e.source}->${e.target}->${e.relation}`;
}
