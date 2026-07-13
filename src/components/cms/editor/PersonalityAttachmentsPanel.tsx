/**
 * PersonalityAttachmentsPanel — admin-only evidence attachments for a
 * personality (CMS editor sidebar). Ported from the PHP tool's "Wikipedia-
 * Artikel ablegen": paste a Wikipedia URL and the archive-wikipedia-personality
 * edge function fetches + stores an HTML snapshot in the private
 * `personality-attachments` bucket and records a row. Files are read via
 * short-lived signed URLs. Does not touch the editor's own save flow.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ExternalLink, Trash2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Attachment {
  id: string;
  kind: string;
  title: string;
  source_url: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

const BUCKET = 'personality-attachments';

export function PersonalityAttachmentsPanel({ personalityId }: { personalityId: string | null }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');

  const { data: rows, isLoading } = useQuery({
    queryKey: ['personality-attachments', personalityId],
    enabled: !!personalityId,
    queryFn: async () => {
      const { data, error } = await untypedFrom('personality_attachments')
        .select('id, kind, title, source_url, storage_path, mime_type, size_bytes, created_at')
        .eq('personality_id', personalityId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const archive = useMutation({
    mutationFn: async (wikiUrl: string) => {
      const { data, error } = await supabase.functions.invoke('archive-wikipedia-personality', {
        body: { personalityId, url: wikiUrl },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Archive failed');
      return data;
    },
    onSuccess: () => {
      toast.success('Wikipedia article archived');
      setUrl('');
      qc.invalidateQueries({ queryKey: ['personality-attachments', personalityId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Archive failed'),
  });

  const remove = useMutation({
    mutationFn: async (att: Attachment) => {
      await supabase.storage.from(BUCKET).remove([att.storage_path]);
      const { error } = await untypedFrom('personality_attachments').delete().eq('id', att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Attachment removed');
      qc.invalidateQueries({ queryKey: ['personality-attachments', personalityId] });
    },
    onError: () => toast.error('Could not remove attachment'),
  });

  const openSnapshot = async (att: Attachment) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(att.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Could not open snapshot');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  if (!personalityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the personality first to attach evidence.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://de.wikipedia.org/wiki/…"
          disabled={archive.isPending}
        />
        <Button
          size="sm"
          onClick={() => url.trim() && archive.mutate(url.trim())}
          disabled={archive.isPending || !url.trim()}
          className="self-end"
        >
          {archive.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Archive className="mr-1 h-4 w-4" />
          )}
          Archive Wikipedia article
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="animate-spin" size={20} aria-label="Loading" />
        </div>
      ) : (rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(rows ?? []).map((att) => (
            <li
              key={att.id}
              className="flex items-start justify-between gap-2 rounded-element border border-border p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-13 font-medium">{att.title}</p>
                {att.source_url && (
                  <a
                    href={att.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-2xs text-muted-foreground"
                  >
                    {att.source_url}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label="Open snapshot"
                  onClick={() => openSnapshot(att)}
                >
                  <ExternalLink size={15} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  aria-label="Remove attachment"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(att)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
