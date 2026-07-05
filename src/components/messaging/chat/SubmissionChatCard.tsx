import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FilePlus2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { SubmissionMeta } from '@/components/messaging/chat/submissionShare';

interface SubmissionStatusRow {
  submission_id: string;
  status: string;
  promoted_to_table: string | null;
  promoted_to_id: string | null;
}

const PATH_PREFIX: Record<string, string> = {
  events: '/events',
  venues: '/venues',
  marketplace_listings: '/marketplace',
  news_articles: '/news',
  personalities: '/personalities',
};

function statusLabel(row: SubmissionStatusRow | undefined): string {
  if (!row) return 'pending';
  if (row.promoted_to_id) return 'published';
  return row.status;
}

/**
 * Chat card for an in-chat submission batch. Live per-item status via the
 * conversation-scoped get_chat_submission_status RPC (no realtime — status
 * changes are rare; focus refetch keeps it honest).
 */
export function SubmissionChatCard({ messageId, meta }: { messageId: string; meta: SubmissionMeta }) {
  const { t } = useTranslation();
  const isTemp = messageId.startsWith('temp-');
  const { data: statuses = [] } = useQuery({
    queryKey: ['chat-submission-status', messageId],
    enabled: !isTemp,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SubmissionStatusRow[]> => {
      const { data, error } = await untypedRpc('get_chat_submission_status', {
        p_message_id: messageId,
      });
      if (error) throw error;
      return (data ?? []) as SubmissionStatusRow[];
    },
  });
  const byId = new Map(statuses.map((s) => [s.submission_id, s]));

  return (
    <div
      className="flex flex-col gap-1 rounded-element border border-border bg-card px-2 py-2"
      style={{ minWidth: 220 }}
    >
      <div className="flex items-center gap-2 px-2 pt-1">
        <FilePlus2 size={14} className="text-muted-foreground shrink-0" />
        <span className="text-2xs uppercase tracking-wider text-muted-foreground">
          {t('chat.submission.header', {
            defaultValue: 'Added to Queer Guide ({{count}})',
            count: meta.items.length,
          })}
        </span>
      </div>
      {meta.items.map((item) => {
        const row = byId.get(item.id);
        const label = statusLabel(row);
        const published = !!row?.promoted_to_id;
        const path =
          published && row?.promoted_to_table && PATH_PREFIX[row.promoted_to_table]
            ? `${PATH_PREFIX[row.promoted_to_table]}/${row.promoted_to_id}`
            : null;
        const inner = (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">{item.content_type}</p>
            </div>
            <Badge variant={published ? 'default' : 'outline'} className="rounded-badge shrink-0">
              {label}
            </Badge>
            {path && <ArrowRight size={12} className="shrink-0 text-muted-foreground" />}
          </>
        );
        return path ? (
          <Link
            key={item.id}
            to={path}
            className="flex items-center gap-2 rounded-element px-2 py-1 hover:bg-muted/50 transition-colors"
          >
            {inner}
          </Link>
        ) : (
          <div key={item.id} className="flex items-center gap-2 rounded-element px-2 py-1">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
