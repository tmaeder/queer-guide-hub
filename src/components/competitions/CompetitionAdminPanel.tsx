import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useCompetitionIds } from '@/hooks/useCompetitions';
import type { Competition } from '@/types/competition';

/**
 * Staff-only list of the competitions on a category page, each with the admin
 * menu (edit + export).
 *
 * Competitions have no detail page of their own: a category page shows every
 * competition of one type as a table of seasons. So the per-record admin menu
 * lives here, one row per competition, instead of once per season row in the
 * table, where a franchise with seventeen seasons would repeat it seventeen
 * times. Staff-only, so its copy is English like the admin menu it hosts. Renders nothing for anyone who cannot manage content, and fetches
 * nothing for them either.
 */
export function CompetitionAdminPanel({ competitions }: { competitions: Competition[] }) {
  const { canManageContent } = useAdminRoles();
  const staff = canManageContent();
  const { data: ids } = useCompetitionIds(
    competitions.map((c) => c.slug),
    staff,
  );

  if (!staff || !ids || competitions.length === 0) return null;

  return (
    <section
      aria-labelledby="competition-admin-panel-title"
      className="mt-8 rounded-container border border-border-hairline p-4"
      data-testid="competition-admin-panel"
    >
      <h2
        id="competition-admin-panel-title"
        className="text-2xs uppercase tracking-wide text-muted-foreground"
      >
        Competitions on this page (staff)
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {competitions.map((c) =>
          ids[c.slug] ? (
            <li key={c.slug} className="flex items-center justify-between gap-4 py-2">
              <span className="text-15">{c.name}</span>
              <AdminEditButton
                contentType="competitions"
                contentId={ids[c.slug]}
                contentName={c.name}
                onSaved={() => window.location.reload()}
                exportable
              />
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}

export default CompetitionAdminPanel;
