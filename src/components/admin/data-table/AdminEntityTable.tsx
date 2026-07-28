import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
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

  return (
    <div className="w-full p-6">
      {/* AdminPageHeader supplies the route eyebrow, typography tokens and back
          link. Adopting it here gives every AdminEntityTable consumer — the 8
          taxonomy pages included — the standard header in one edit, replacing a
          hand-rolled <h4 className="text-2xl font-bold"> that bypassed the type
          scale. AdminPageHeader prefixes "Back to", so labels are bare nouns. */}
      <AdminPageHeader
        title={title}
        subtitle={subtitle}
        actions={headerActions}
        backTo={
          backHref === null
            ? undefined
            : { route: backHref, label: backLabel.replace(/^back\s*(to\s*)?/i, '') || 'Cockpit' }
        }
      />

      {beforeTable}

      <AdminDataTable config={config} />

      {afterTable}
    </div>
  );
}
