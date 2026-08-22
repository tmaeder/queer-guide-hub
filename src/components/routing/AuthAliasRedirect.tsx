import { Navigate, useLocation } from 'react-router';

/**
 * Forwards the /signin and /login aliases to /auth, preserving the query.
 *
 * A bare `<Navigate to="/auth" replace />` drops `location.search`, which
 * would discard the `?redirect=` these aliases exist to carry — re-creating
 * the bug in a different place. React Router only copies the search string
 * when you pass it explicitly.
 *
 * The aliases are also mounted at the TOP LEVEL, not just under `/:locale?`.
 * Previously they existed only as children of the locale parent, so a bare
 * `/signin` was parsed as locale "signin", matched nothing, and rendered
 * NotFound — an in-app CTA pointed at it for months.
 */
export function AuthAliasRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/auth', search, hash }} replace />;
}
