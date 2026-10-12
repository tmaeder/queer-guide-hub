export type GovernanceMode = 'triage' | 'engines' | 'merge' | 'tags' | 'editorial';
import { Navigate, useLocation } from 'react-router';
import { reviewRedirectUrl } from '@/components/admin/review-workspace/reviewRedirects';

export default function AdminGovernance() {
  const location = useLocation();
  return <Navigate to={reviewRedirectUrl(location.search)} replace />;
}
