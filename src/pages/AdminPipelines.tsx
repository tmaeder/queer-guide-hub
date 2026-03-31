import { lazy, Suspense } from 'react';

const PipelineBuilder = lazy(() => import('@/components/admin/pipeline-builder/PipelineBuilder'));

export default function AdminPipelines() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading Pipeline Builder...</div>}>
      <PipelineBuilder />
    </Suspense>
  );
}
