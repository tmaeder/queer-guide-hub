import { useSearchParams } from 'react-router';
import { TriageView } from '@/components/admin/triage/TriageView';

const TAB_TO_QUEUE: Record<string, string> = {
  staging: 'staging',
  moderation: 'moderation',
  submissions: 'submissions',
  content: 'content',
  tags: 'tags',
  duplicates: 'duplicates',
  automation: 'automation',
  'news-quality': 'news-quality',
  'entity-links': 'entity-links',
};

export default function AdminReview() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const queue = searchParams.get('queue');
  const initialQueue = queue ?? (tab ? TAB_TO_QUEUE[tab] : undefined) ?? undefined;

  return <TriageView initialQueueType={initialQueue} />;
}
