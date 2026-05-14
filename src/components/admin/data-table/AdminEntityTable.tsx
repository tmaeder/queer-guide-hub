import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
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
  skipAuthGuard?: boolean;
}

export function AdminEntityTable<TData extends { id: string }>({
  title,
  subtitle,
  backHref = '/admin',
  backLabel = 'Back',
  config,
  beforeTable,
  afterTable,
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
        <div className="p-6 text-center">
          <p>Loading...</p>
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
      <div className="flex items-center gap-4 mb-6">
        {backHref !== null && (
          <Button variant="outline" onClick={() => navigate(backHref)}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            {backLabel}
          </Button>
        )}
        <div>
          <h4 className="text-2xl font-bold">{title}</h4>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      {beforeTable}

      <AdminDataTable config={config} />

      {afterTable}
    </div>
  );
}
