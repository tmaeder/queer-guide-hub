import { lazy, Suspense, type ComponentProps } from 'react';

// Lazy wrapper so trip surfaces don't pull the maplibre chunk until a map is
// actually rendered (planner accordion, day-card peek, shared-trip view).
const Inner = lazy(() => import('./TripMap').then((m) => ({ default: m.TripMap })));

export function TripMap(props: ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<div className="h-full w-full bg-muted animate-pulse" />}>
      <Inner {...props} />
    </Suspense>
  );
}
