import i18next from 'i18next';

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

export interface ClusterCounts {
  venues: number;
  events: number;
  restrooms: number;
  hotels: number;
  total: number;
}

/** "12 venues · 3 events — Click to zoom in" cluster preview. */
export function clusterHoverHtml(counts: ClusterCounts): string {
  const t = i18next.t.bind(i18next);
  const parts: string[] = [];
  const add = (n: number, key: string, one: string, many: string) => {
    if (n > 0)
      parts.push(
        t(key, { count: n, defaultValue: n === 1 ? `{{count}} ${one}` : `{{count}} ${many}` }),
      );
  };
  add(counts.venues, 'map.canvas.venueCount', 'venue', 'venues');
  add(counts.events, 'map.canvas.eventCount', 'event', 'events');
  add(counts.restrooms, 'map.canvas.restroomCount', 'restroom', 'restrooms');
  add(counts.hotels, 'map.canvas.hotelCount', 'hotel', 'hotels');
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
  const sub = subtitle
    ? `<div class="qg-map-hover__meta">${escapeHtml(subtitle)}</div>`
    : '';
  return `<div class="qg-map-hover">${thumb}<div class="qg-map-hover__body"><div class="qg-map-hover__title">${escapeHtml(
    name,
  )}</div>${sub}</div></div>`;
}
