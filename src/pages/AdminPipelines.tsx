import { lazy, Suspense } from 'react';

const UnifiedDataOps = lazy(() => import('@/components/admin/pipeline-builder/UnifiedDataOps'));

export default function AdminPipelines() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground">Loading Data Operations...</div>
      }
    >
      <UnifiedDataOps />
    </Suspense>
  );
}
