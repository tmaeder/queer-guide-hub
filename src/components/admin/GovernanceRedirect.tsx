import { Navigate, useLocation } from 'react-router';
import type { GovernanceMode } from '@/pages/admin/AdminGovernance';
import { reviewRedirectUrl } from '@/components/admin/review-workspace/reviewRedirects';
export function GovernanceRedirect({ mode }: { mode: GovernanceMode }) {
  const location = useLocation();
  const url = reviewRedirectUrl(location.search, mode);
  const query = url.indexOf('?');
  return (
    <Navigate
      to={{ pathname: '/admin', search: query < 0 ? '' : url.slice(query), hash: location.hash }}
      replace
    />
  );
}
