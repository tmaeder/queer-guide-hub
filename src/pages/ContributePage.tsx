import { useLocation, useParams } from 'react-router';
import { ContributeDialog, type ContributeBranch } from '@/components/contribute/ContributeDialog';

export default function ContributePage({ type }: { type?: string } = {}) {
  const params = useParams<{ contentType?: string }>();
  const location = useLocation();
  const slug = type ?? params.contentType ?? location.pathname.split('/').filter(Boolean).pop();
  const isRoot = slug === 'submit';
  const initialBranch: ContributeBranch = isRoot
    ? 'chooser'
    : slug === 'feedback'
      ? 'feedback'
      : 'add';

  return (
    <ContributeDialog
      mode="page"
      initialBranch={initialBranch}
      initialType={!isRoot && slug !== 'feedback' ? slug : undefined}
    />
  );
}
