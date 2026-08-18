import { useTranslation } from 'react-i18next';
import { MapShell } from '@/components/map/MapShell';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

/**
 * Admin map view — geographic visualization of ingestion + content state.
 *
 * Uses the shared <MapShell surface="admin"> with the Combined lens by default
 * (density heatmap beneath the pins) so editors can see where venue/event
 * coverage is thin at a glance while still reading individual markers. Filters
 * (category, time) and the layer toggle expose the same data planes the
 * public map uses; URL state lets editors share a specific view.
 */
export default function AdminMaps() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      {/* No eyebrow: the route line is derived from the registry. */}
      <AdminArchetypeHeader title={t('admin.maps.title', { defaultValue: 'Maps' })} />

      {/* Kept as body copy, and kept TRANSLATED: it explains the lens switcher,
        which is how this tool is actually operated. Dropping it with the
        subtitle slot would also have discarded an i18n string. */}
      <p className="m-0 max-w-reading text-13 leading-relaxed text-muted-foreground">
        {t('admin.maps.description', {
          defaultValue:
            'Geographic view of platform content. Switch lenses to see density, individual entities, or boundaries.',
        })}
      </p>
      <div className="border border-border" style={{ height: 'calc(100dvh - 200px)' }}>
        <MapShell surface="admin" height="100%" />
      </div>
    </div>
  );
}
