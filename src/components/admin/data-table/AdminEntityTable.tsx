import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { AdminDataTable } from './AdminDataTable';
import type { AdminTableConfig } from './types';

export interface AdminEntityTableProps<TData extends { id: string }> {
  /** Page header title (e.g. "Tags Management"). */
  title: string;
  /** Subtitle / description below the title. */
  subtitle?: string;
  /** Where the back button links to. Defaults to `/admin`. Set to `null` to hide. */
  backHref?: string | null;
  /** Backwards-compat alias used while pages migrate. */
  backLabel?: string;
  /** Table configuration forwarded to AdminDataTable. */
  config: AdminTableConfig<TData>;
  /** Slot rendered between page header and the data table (e.g. categorizers, merge widgets). */
  beforeTable?: ReactNode;
  /** Slot rendered below the data table (e.g. dialogs, secondary tools). */
  afterTable?: ReactNode;
  /** Skip auth/role gating. Useful for tests and pages with custom guards. */
  skipAuthGuard?: boolean;
}

/**
 * Opinionated shell that combines the standard admin page chrome
 * (auth guard + header + back button) with `AdminDataTable`.
 *
 * Pages provide column defs, filters, row actions, and any entity-specific
 * dialogs via `beforeTable` / `afterTable` slots. All filter / sort /
 * pagination / search boilerplate lives inside `AdminDataTable`.
 */
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
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Loading...</Typography>
        </Box>
      );
    }
    if (!canManageContent()) {
      navigate('/');
      return null;
    }
  }

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        {backHref !== null && (
          <Button variant="outline" onClick={() => navigate(backHref)}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            {backLabel}
          </Button>
        )}
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>

      {beforeTable}

      <AdminDataTable config={config} />

      {afterTable}
    </Box>
  );
}
