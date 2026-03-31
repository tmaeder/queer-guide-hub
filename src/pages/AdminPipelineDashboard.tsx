import { lazy, Suspense } from 'react';

const PipelineDashboard = lazy(() => import('@/components/admin/pipeline-builder/PipelineDashboard'));

export default function AdminPipelineDashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading Pipeline Dashboard...</div>}>
      <PipelineDashboard />
    </Suspense>
  );
}
