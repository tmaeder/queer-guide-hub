import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { submissionRegistry } from '@/config/submissionRegistry';

interface CandidateRow {
  id: string;
  content_type: string;
  status: string;
  platform: string | null;
  data: Record<string, unknown> | null;
  submitted_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  contentType: string;
  currentDuplicateOf?: string | null;
  onMerged?: () => void;
}

const titleOf = (row: CandidateRow): string => {
  const cfg = submissionRegistry[row.content_type];
  const f = cfg?.titleField || 'name';
  const v = row.data?.[f] ?? row.data?.title ?? row.data?.name;
  return typeof v === 'string' && v ? v : '(untitled)';
};

export function MergeDuplicatesDialog({
  open,
  onOpenChange,
  submissionId,
  contentType,
  currentDuplicateOf,
  onMerged,
}: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [picked, setPicked] = useState<string | null>(currentDuplicateOf ?? null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setPicked(currentDuplicateOf ?? null);
  }, [open, currentDuplicateOf]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      let q = supabase
        .from('community_submissions')
        .select('id, content_type, status, platform, data, submitted_at')
        .eq('content_type', contentType)
        .neq('id', submissionId)
        .in('status', ['pending', 'approved', 'merged'])
        .order('submitted_at', { ascending: false })
        .limit(25);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        toast({ title: 'Search failed', description: error.message, variant: 'destructive' });
        setCandidates([]);
      } else {
        setCandidates((data ?? []) as CandidateRow[]);
      }
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, contentType, submissionId, toast]);

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((row) => {
      const t = titleOf(row).toLowerCase();
      return t.includes(q) || row.id.toLowerCase().includes(q);
    });
  }, [candidates, search]);

  const handleMerge = async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submission-action', {
        body: { submission_id: submissionId, action: 'merge', duplicate_of: picked },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Marked as duplicate' });
      onOpenChange(false);
      onMerged?.();
    } catch (err) {
      toast({
        title: 'Merge failed',
        description: err instanceof Error ? err.message : 'unknown',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>Merge into existing submission</DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            placeholder="Search by title or id…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />

          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {loading && (
              <div style={{ color: 'var(--muted-foreground)', padding: 8 }}>Loading…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ color: 'var(--muted-foreground)', padding: 8 }}>
                No candidates found.
              </div>
            )}
            {filtered.map((row) => {
              const selected = row.id === picked;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setPicked(row.id)}
                  style={{
                    textAlign: 'left',
                    padding: 8,
                    background: selected ? 'var(--accent)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>{titleOf(row)}</span>
                    <Badge variant="outline">{row.status}</Badge>
                    {row.platform && <Badge variant="secondary">{row.platform}</Badge>}
                  </div>
                  <code style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    {row.id}
                  </code>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={!picked || submitting}>
            {submitting ? 'Merging…' : 'Mark as duplicate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
