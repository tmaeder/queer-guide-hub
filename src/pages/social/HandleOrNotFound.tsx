import { lazy, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useResolveHandle } from '@/hooks/useOpenWeb';

const NotFound = lazy(() => import('@/pages/NotFound'));

// `/@handle` (optionally under a locale prefix). React Router cannot match a
// partial segment like "@:handle", so the catch-all hands these paths here.
const HANDLE_RE = /^(?:\/[a-z]{2}(?:-[A-Z]{2})?)?\/@([A-Za-z0-9._]{3,20})\/?$/;

function HandleProfile({ handle }: { handle: string }) {
  const { data, isLoading } = useResolveHandle(handle);
  if (isLoading) return <PageLoadingState count={1} variant="list" />;
  if (data?.redirect) return <Navigate to={`/@${data.redirect}`} replace />;
  if (data?.user_id) return <Navigate to={`/user/${data.user_id}`} replace />;
  return <NotFound />;
}

/** Catch-all: Bluesky-style `/@handle` profile links, else the normal 404. */
export default function HandleOrNotFound() {
  const { pathname } = useLocation();
  const m = HANDLE_RE.exec(pathname);
  return <Suspense fallback={null}>{m ? <HandleProfile handle={m[1]} /> : <NotFound />}</Suspense>;
}
