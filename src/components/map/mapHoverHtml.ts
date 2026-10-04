import i18next from 'i18next';
import { MAP_LINES, MAP_LINE_IDS, type MapLine } from '@/components/map/mapDomain';

/**
 * Pure HTML builders for the lightweight MapLibre hover popups (cluster
 * composition preview + point name/subtitle preview). Class-based markup —
 * the `.qg-map-hover*` styles in src/index.css use design tokens, so the
 * popups inherit Inter + theme colors instead of `font:13px system-ui`.
 */

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

/**
 * Cluster composition, by LINE.
 *
 * Was keyed by layer (venues/events/restrooms/hotels) — the third of three
 * literal copies of the cluster-aggregate names, alongside `clusterProperties`
 * and `clusterDonut`. All three now read the registry, so a donut segment can
 * no longer disagree with the number beside it.
 */
export type ClusterCounts = Partial<Record<MapLine, number>> & { total: number };

/** "12 Venues · 3 Events — Click to zoom in" cluster preview. */
export function clusterHoverHtml(counts: ClusterCounts): string {
  const t = i18next.t.bind(i18next);
  const parts: string[] = [];
  for (const line of MAP_LINE_IDS) {
    const n = counts[line] ?? 0;
    if (n <= 0) continue;
    // The line's own label, so the breakdown names the same thing the legend
    // and the line switch do. No singular/plural pair: a line label is a
    // proper noun for a route ("Community & care"), not a count noun.
    const name = t(`map.lines.${line}`, { defaultValue: MAP_LINES[line].label });
    parts.push(`${n} ${name}`);
  }
  const label = parts.length
    ? parts.join(' · ')
    : t('map.canvas.placeCount', { count: counts.total, defaultValue: '{{count}} places' });
  const hint = t('map.canvas.clickToZoom', { defaultValue: 'Click to zoom in' });
  return `<div class="qg-map-hover"><div class="qg-map-hover__body"><div class="qg-map-hover__title">${escapeHtml(
    label,
  )}</div><div class="qg-map-hover__meta">${escapeHtml(hint)}</div></div></div>`;
}

export interface PointHoverInput {
  name: string;
  subtitle?: string;
  imageUrl?: string;
}

/** Name + subtitle (+ optional thumb) point preview. */
export function pointHoverHtml({ name, subtitle, imageUrl }: PointHoverInput): string {
  // referrerpolicy=no-referrer dodges publisher-CDN hotlink walls; onerror
  // removes the node so a dead URL collapses cleanly (no broken-image glyph).
  const thumb = imageUrl
    ? `<img src="${encodeURI(imageUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" class="qg-map-hover__thumb"/>`
    : '';
  const sub = subtitle ? `<div class="qg-map-hover__meta">${escapeHtml(subtitle)}</div>` : '';
  return `<div class="qg-map-hover">${thumb}<div class="qg-map-hover__body"><div class="qg-map-hover__title">${escapeHtml(
    name,
  )}</div>${sub}</div></div>`;
}
