import { useTranslation } from 'react-i18next';
import { MapShell } from '@/components/map/MapShell';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

/**
 * Admin map view — geographic visualization of ingestion + content state.
 *
 * Uses the shared <MapShell surface="admin"> with Density lens by default so
 * editors can see where venue/event coverage is thin at a glance. Filters
 * (category, time) and the layer toggle expose the same data planes the
 * public map uses; URL state lets editors share a specific view.
 */
export default function AdminMaps() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        eyebrow="Cockpit"
        title={t('admin.maps.title', { defaultValue: 'Maps' })}
        subtitle={t('admin.maps.description', {
          defaultValue:
            'Geographic view of platform content. Switch lenses to see density, individual entities, or boundaries.',
        })}
      />
      <div className="border border-border" style={{ height: 'calc(100dvh - 200px)' }}>
        <MapShell surface="admin" height="100%" />
      </div>
    </div>
  );
}
