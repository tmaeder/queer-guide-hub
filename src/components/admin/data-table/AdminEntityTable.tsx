import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { AdminIndexFrame } from '@/components/admin/frames/AdminIndexFrame';
import { AdminCardSkeleton } from '@/components/admin/primitives/AdminLoading';
import { AdminDataTable } from './AdminDataTable';
import type { AdminTableConfig } from './types';

export interface AdminEntityTableProps<TData extends { id: string }> {
  title: string;
  subtitle?: string;
  backHref?: string | null;
  backLabel?: string;
  config: AdminTableConfig<TData>;
  beforeTable?: ReactNode;
  afterTable?: ReactNode;
  /** Right-aligned actions in the page header row (links, secondary buttons). */
  headerActions?: ReactNode;
  skipAuthGuard?: boolean;
}

export function AdminEntityTable<TData extends { id: string }>({
  title,
  subtitle,
  backHref = '/admin',
  backLabel = 'Cockpit',
  config,
  beforeTable,
  afterTable,
  headerActions,
  skipAuthGuard = false,
}: AdminEntityTableProps<TData>) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();

  if (!skipAuthGuard) {
    if (!user) {
      navigate('/auth');
      return null;
    }
    if (rolesLoading) {
      return (
        <div className="w-full p-6">
          <AdminCardSkeleton />
        </div>
      );
    }
    if (!canManageContent()) {
      navigate('/');
      return null;
    }
  }

  const backTo = backHref === null ? null : backHref;
  const backText = backLabel.replace(/^back\s*(to\s*)?/i, '') || 'Cockpit';

  return (
    /* Archetype A — the index frame. Adopting it HERE rather than per page is
       the highest-leverage edit in the migration: every AdminEntityTable
       consumer gets the fixed header grammar in one change.

       `p-6` is gone. AdminShell's <main> is documented as "the ONE owner of
       admin page spacing" and already applies the gutter, so this wrapper was
       double-padding every consumer — the exact defect that rule was written
       to end.

       The back link survives as a secondary ACTION. The archetype grammar has
       no back slot, and the mock omits one, but a migrated route also loses the
       shell's breadcrumb bar — so on these pages the link is more useful after
       the migration, not less. Dropping it to match the mock would be a
       silent navigation regression. */
    <AdminIndexFrame
      title={title}
      countLine={subtitle}
      actions={
        <>
          {backTo && (
            <Link
              to={backTo}
              className="inline-flex items-center gap-1 text-13 font-bold no-underline hover:underline"
            >
              <ArrowLeft size={14} aria-hidden />
              {/* "Back to X". AdminPageHeader used to add the prefix, so
                 callers pass a bare noun and the visible string must stay
                 identical — this is a layout migration, not a copy change. */}
              Back to {backText}
            </Link>
          )}
          {headerActions}
        </>
      }
    >
      {beforeTable}

      <AdminDataTable config={config} />

      {afterTable}
    </AdminIndexFrame>
  );
}
