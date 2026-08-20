import { lazy, Suspense } from 'react';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

const UnifiedDataOps = lazy(() => import('@/components/admin/pipeline-builder/UnifiedDataOps'));

/**
 * The header sits OUTSIDE the Suspense boundary on purpose: it is the page's
 * only <h1>, and inside the boundary the route would render heading-less for
 * as long as the lazy chunk takes — which is exactly the window a screen
 * reader or a route guard lands in.
 *
 * Until 2026-08-19 there was no header at all. This was the only route in
 * ADMIN_ARCHETYPES that never adopted `AdminArchetypeHeader`, and the tab bar
 * in UnifiedDataOps emits no heading of its own, so /admin/pipelines was the
 * single admin route with zero h1s. axe does not flag a missing h1 (it is a
 * best practice, not a violation), so e2e/a11y-admin.spec.ts stayed green over
 * it for the whole time.
 */
export default function AdminPipelines() {
  return (
    <div className="flex flex-col">
      <AdminArchetypeHeader title="Pipelines" />
      <Suspense fallback={<AdminTextSkeleton lines={2} />}>
        <UnifiedDataOps />
      </Suspense>
    </div>
  );
}
