import i18next from 'i18next';
import type { MapMarker } from '@/hooks/useExploreMapData';

/**
 * Generates popup HTML for a map marker based on its type.
 * Returns a plain HTML string for use with maplibregl.Popup.setHTML().
 */
export function renderPopupHTML(marker: MapMarker): string {
  const esc = (s?: string) =>
    (s ?? '').replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!,
    );

  const muted = 'hsl(var(--muted-foreground))';
  const badge = 'background:hsl(var(--muted));color:hsl(var(--muted-foreground))';

  const tViewDetails = i18next.t('map.popup.viewDetails', { defaultValue: 'View details' });
  const tShare = i18next.t('map.popup.share', { defaultValue: 'Share' });

  const link = marker.linkTo
    ? `<a href="${esc(marker.linkTo)}" style="color:#6366f1;text-decoration:none;font-size:11px;">${esc(tViewDetails)} →</a>`
    : '';

  const share = marker.linkTo
    ? `<button type="button" data-share-id="${esc(marker.id)}" data-share-name="${esc(marker.name)}" data-share-url="${esc(marker.linkTo ?? '')}" data-share-subtitle="${esc(marker.subtitle ?? '')}" style="margin-left:8px;background:none;border:none;padding:0;color:#6366f1;text-decoration:none;font-size:11px;cursor:pointer;font-family:inherit;">${esc(tShare)}</button>`
    : '';

  switch (marker.type) {
    case 'venues': {
      const category = marker.meta?.category ?? 'Venue';
      const city = marker.meta?.city ?? '';
      return `
        <div style="min-width:180px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          <span style="font-size:12px;color:${muted};">${esc(category)}</span><br/>
          ${city ? `<span style="font-size:11px;color:${muted};">${esc(city)}</span><br/>` : ''}
          ${link}
          ${share}
        </div>`;
    }

    case 'events': {
      const venue = marker.meta?.venueName ?? '';
      const city = marker.meta?.city ?? '';
      return `
        <div style="min-width:180px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:#ec4899;">${esc(marker.subtitle)}</span><br/>` : ''}
          ${venue ? `<span style="font-size:11px;color:${muted};">@ ${esc(venue)}</span><br/>` : ''}
          ${city ? `<span style="font-size:11px;color:${muted};">${esc(city)}</span><br/>` : ''}
          ${link}
          ${share}
        </div>`;
    }

    case 'cities': {
      const pop = marker.meta?.population
        ? `Pop. ${Number(marker.meta.population).toLocaleString()}`
        : '';
      const capital = marker.meta?.isCapital ? ' <b style="color:#f59e0b;">★ Capital</b>' : '';
      const cityPrecision = marker.meta?.precision as string | undefined;
      const cityBadge = cityPrecision
        ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;${badge};font-weight:500;margin-left:6px;">${esc(cityPrecision.charAt(0).toUpperCase() + cityPrecision.slice(1))}</span>`
        : '';
      return `
        <div style="min-width:160px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong>${capital}${cityBadge}<br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:${muted};">${esc(marker.subtitle)}</span><br/>` : ''}
          ${pop ? `<span style="font-size:11px;color:${muted};">${pop}</span><br/>` : ''}
          ${link}
          ${share}
        </div>`;
    }

    case 'countries': {
      const capital = marker.meta?.capital ?? '';
      const continent = marker.meta?.continent ?? '';
      const precision = marker.meta?.precision as string | undefined;
      const precisionBadge = precision
        ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;${badge};font-weight:500;margin-left:6px;">${esc(precision.charAt(0).toUpperCase() + precision.slice(1))}</span>`
        : '';
      return `
        <div style="min-width:160px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong>${precisionBadge}<br/>
          ${capital ? `<span style="font-size:12px;color:${muted};">Capital: ${esc(capital)}</span><br/>` : ''}
          ${continent ? `<span style="font-size:11px;color:${muted};">${esc(continent)}</span><br/>` : ''}
          ${link}
          ${share}
        </div>`;
    }

    case 'neighbourhoods': {
      const city = marker.meta?.city ?? '';
      const desc = marker.meta?.description
        ? esc(marker.meta.description).slice(0, 100) +
          (marker.meta.description.length > 100 ? '…' : '')
        : '';
      const nhPrecision = marker.meta?.precision as string | undefined;
      const nhBadge = nhPrecision
        ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;${badge};font-weight:500;margin-left:6px;">${esc(nhPrecision.charAt(0).toUpperCase() + nhPrecision.slice(1))}</span>`
        : '';
      return `
        <div style="min-width:180px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong>${nhBadge}<br/>
          ${city ? `<span style="font-size:12px;color:${muted};">${esc(city)}</span><br/>` : ''}
          ${desc ? `<span style="font-size:11px;color:${muted};">${desc}</span><br/>` : ''}
          ${link}
          ${share}
        </div>`;
    }

    case 'restrooms': {
      const accessible = marker.meta?.accessible ? '♿ Accessible' : '';
      const unisex = marker.meta?.unisex ? '⚧ Unisex' : '';
      const badges = [accessible, unisex].filter(Boolean).join(' · ');
      return `
        <div style="min-width:160px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:${muted};">${esc(marker.subtitle)}</span><br/>` : ''}
          ${badges ? `<span style="font-size:11px;">${badges}</span><br/>` : ''}
          ${link}
          ${share}
        </div>`;
    }

    default:
      return `
        <div style="min-width:140px;padding:6px 2px;">
          <strong style="font-size:14px;">${esc(marker.name)}</strong><br/>
          ${marker.subtitle ? `<span style="font-size:12px;color:${muted};">${esc(marker.subtitle)}</span>` : ''}
          ${link}
          ${share}
        </div>`;
  }
}
