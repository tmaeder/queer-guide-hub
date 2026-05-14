import { lazy, Suspense } from 'react';

const UnifiedDataOps = lazy(() => import('@/components/admin/pipeline-builder/UnifiedDataOps'));

export default function AdminPipelines() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>Loading Data Operations...</div>}>
      <UnifiedDataOps />
    </Suspense>
  );
}
