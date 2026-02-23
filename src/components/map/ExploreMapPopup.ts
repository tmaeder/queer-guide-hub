import type { MapMarker } from '@/hooks/useExploreMapData';

/**
 * Generates popup HTML for a map marker based on its type.
 * Returns a plain HTML string for use with maplibregl.Popup.setHTML().
 */
export function renderPopupHTML(marker: MapMarker): string {
  const esc = (s?: string) => (s ?? '').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!));

  const link = marker.linkTo
    ? `<a href="${esc(marker.linkTo)}" style="color:#6366f1;text-decoration:none;font-size:11px;">View details →</a>`
    : '';

  switch (marker.type) {
    case 'venues': {
      const category = marker.meta?.category ?? 'Venue';
      const city = marker.meta?.city ?? '';
      return `
        <div style="min-width:180px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          <span style="font-size:12px;color:#6b7280;">${esc(category)}</span><br/>
          ${city ? `<span style="font-size:11px;color:#9ca3af;">${esc(city)}</span><br/>` : ''}
          ${link}
        </div>`;
    }

    case 'events': {
      const venue = marker.meta?.venueName ?? '';
      const city = marker.meta?.city ?? '';
      return `
        <div style="min-width:180px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:#ec4899;">${esc(marker.subtitle)}</span><br/>` : ''}
          ${venue ? `<span style="font-size:11px;color:#6b7280;">@ ${esc(venue)}</span><br/>` : ''}
          ${city ? `<span style="font-size:11px;color:#9ca3af;">${esc(city)}</span><br/>` : ''}
          ${link}
        </div>`;
    }

    case 'cities': {
      const pop = marker.meta?.population
        ? `Pop. ${Number(marker.meta.population).toLocaleString()}`
        : '';
      const capital = marker.meta?.isCapital ? ' <b style="color:#f59e0b;">★ Capital</b>' : '';
      return `
        <div style="min-width:160px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong>${capital}<br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:#6b7280;">${esc(marker.subtitle)}</span><br/>` : ''}
          ${pop ? `<span style="font-size:11px;color:#9ca3af;">${pop}</span><br/>` : ''}
          ${link}
        </div>`;
    }

    case 'countries': {
      const capital = marker.meta?.capital ?? '';
      const continent = marker.meta?.continent ?? '';
      return `
        <div style="min-width:160px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${capital ? `<span style="font-size:12px;color:#6b7280;">Capital: ${esc(capital)}</span><br/>` : ''}
          ${continent ? `<span style="font-size:11px;color:#9ca3af;">${esc(continent)}</span><br/>` : ''}
          ${link}
        </div>`;
    }

    case 'restrooms': {
      const accessible = marker.meta?.accessible ? '♿ Accessible' : '';
      const unisex = marker.meta?.unisex ? '⚧ Unisex' : '';
      const badges = [accessible, unisex].filter(Boolean).join(' · ');
      return `
        <div style="min-width:160px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:#6b7280;">${esc(marker.subtitle)}</span><br/>` : ''}
          ${badges ? `<span style="font-size:11px;">${badges}</span><br/>` : ''}
        </div>`;
    }

    default:
      return `
        <div style="min-width:140px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:#6b7280;">${esc(marker.subtitle)}</span>` : ''}
          ${link}
        </div>`;
  }
}
