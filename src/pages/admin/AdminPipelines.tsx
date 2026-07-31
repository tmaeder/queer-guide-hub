import { lazy, Suspense } from 'react';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';

const UnifiedDataOps = lazy(() => import('@/components/admin/pipeline-builder/UnifiedDataOps'));

export default function AdminPipelines() {
  return (
    <Suspense
      fallback={
        <AdminTextSkeleton lines={2} />
      }
    >
      <UnifiedDataOps />
    </Suspense>
  );
}
