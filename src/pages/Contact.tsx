import { ContributeDialog } from '@/components/contribute/ContributeDialog';

/**
 * Durable deep link into the shared contribution surface. The form itself lives
 * in ContactBranch so the global launcher and /contact cannot drift apart.
 */
export default function Contact() {
  return <ContributeDialog mode="page" initialBranch="contact" />;
}
