import { ContributeDialog } from '@/components/contribute/ContributeDialog';

/**
 * Durable deep link into the shared contribution surface. The form itself lives
 * in ContactBranch so the global launcher and /contact cannot drift apart.
 */
export default function Contact() {
  const category = new URLSearchParams(window.location.search).get('category');
  const isLegacyReportLink = category === 'safety' || category === 'bugs' || category === 'bug';
  return (
    <ContributeDialog
      mode="page"
      initialBranch={isLegacyReportLink ? 'feedback' : 'contact'}
      initialFeedbackCategory={category === 'bugs' ? 'bug' : (category ?? undefined)}
    />
  );
}
