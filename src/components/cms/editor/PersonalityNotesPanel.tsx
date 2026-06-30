/**
 * PersonalityNotesPanel — admin-only internal notes for a personality, surfaced
 * inside the CMS editor sidebar. Re-homes the internal-notes feature from the
 * retired AdminPersonalities page. Self-contained load/save against
 * personality_internal_notes; does not touch the editor's own save flow.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchPersonalityInternalNote,
  upsertPersonalityInternalNote,
} from '@/hooks/usePageFetchers';

export function PersonalityNotesPanel({ personalityId }: { personalityId: string | null }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!personalityId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load; sets loading/notes from an external fetch keyed on personalityId.
    setLoading(true);
    fetchPersonalityInternalNote(personalityId)
      .then((n) => {
        if (!cancelled) setNotes(n ?? '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personalityId]);

  if (!personalityId) {
    return (
      <p className="text-sm text-muted-foreground">Save the personality first to add notes.</p>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    const { error } = await upsertPersonalityInternalNote({
      personality_id: personalityId,
      notes,
      updated_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error('Failed to save note');
    } else {
      toast.success('Internal note saved');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="animate-spin" size={24} aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Admin-only notes (not shown publicly)…"
        rows={5}
      />
      <Button size="sm" onClick={handleSave} disabled={saving} className="self-end">
        {saving ? 'Saving…' : 'Save note'}
      </Button>
    </div>
  );
}
