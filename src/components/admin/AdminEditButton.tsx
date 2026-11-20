import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { usePageEntity } from '@/contexts/PageEntityContext';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAuth } from '@/hooks/useAuth';
import type { AdminEditButtonProps } from './AdminEditButton.impl';

// Type-only: erased at build time, so it pulls nothing into the caller's chunk.
export type { AdminEditButtonProps } from './AdminEditButton.impl';

/**
 * Gate for the staff edit control on public detail pages.
 *
 * The control lives in `AdminEditButton.impl.tsx`. Its static imports reach the
 * whole CMS: AdminFullEditSheet → PipelineInspector, RevisionHistorySheet, and
 * cmsLinks → the contentTypes registry with its admin panels. When this file
 * imported it directly, every venue, event, personality, tag, city, country,
 * village and hotel page shipped the rich-text editor (tiptap) and the chart
 * library (recharts) to every visitor. Lighthouse mobile on 2026-11-20 counted
 * 149 KB + 80 KB of unused JS from those two alone on each of those pages, and
 * the control rendered null for all of those visitors.
 *
 * Now a non-staff visitor gets `null` with nothing loaded. Staff and the
 * content's owner load the real control on demand. A failed chunk drops the
 * control, never the page.
 */
const AdminEditButtonImpl = lazy(() => import('./AdminEditButton.impl'));

export function AdminEditButton(props: AdminEditButtonProps) {
  const { contentType, contentId, contentName, ownerUserId } = props;
  // Detail pages pass their canonical identity here. Publishing it before the
  // permission guard makes it available to the global correction form for
  // every visitor, without duplicating plumbing in each detail page.
  usePageEntity({ contentType, contentId, contentName });
  const { canManageContent, loading } = useAdminRoles();
  const { user } = useAuth();

  const isOwner = Boolean(ownerUserId && user?.id && ownerUserId === user.id);
  if (loading || (!canManageContent() && !isOwner)) return null;

  return (
    <ErrorBoundary section="admin-edit-button" fallback={null}>
      <Suspense fallback={null}>
        <AdminEditButtonImpl {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
