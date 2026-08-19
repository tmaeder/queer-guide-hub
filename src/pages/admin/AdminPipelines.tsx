import { lazy, Suspense } from 'react';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';

const UnifiedDataOps = lazy(() => import('@/components/admin/pipeline-builder/UnifiedDataOps'));

export default function AdminPipelines() {
  return (
    <>
      {/* This route rendered UnifiedDataOps bare, so it emitted NO <h1> at all:
          no programmatic page title, and a failure of the one-h1 invariant in
          e2e/admin-route-baseline.spec.ts. The tab bar below is the page's own
          navigation, not a heading. */}
      <AdminArchetypeHeader title="Data operations" />
      <Suspense fallback={<AdminTextSkeleton lines={2} />}>
        <UnifiedDataOps />
      </Suspense>
    </>
  );
}
