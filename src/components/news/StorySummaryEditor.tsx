import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { updateStorySummary } from '@/hooks/useNewsStories';

/**
 * Staff-only editor for news_stories.summary on /news/story/:slug. The summary
 * is never generated; it stays NULL until an editor writes one here.
 */
export function StorySummaryEditor({
  storyId,
  summary,
  onSaved,
}: {
  storyId: string;
  summary: string | null;
  onSaved: (summary: string | null) => void;
}) {
  const { t } = useTranslation();
  const { isAdmin, isModerator, isEditor } = useAdminRoles();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(summary ?? '');
  const [saving, setSaving] = useState(false);
  if (!isAdmin && !isModerator && !isEditor) return null;

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => {
          setDraft(summary ?? '');
          setOpen(true);
        }}
      >
        {summary
          ? t('newsStory.editSummary', 'Edit summary')
          : t('newsStory.addSummary', 'Add summary')}
      </Button>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await updateStorySummary(storyId, draft));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <label htmlFor="story-summary" className="text-13 font-semibold">
        {t('newsStory.summaryLabel', 'Story summary')}
      </label>
      <Textarea
        id="story-summary"
        value={draft}
        maxLength={1000}
        onChange={(e) => setDraft(e.target.value)}
      />
      <p className="text-13 text-muted-foreground">
        {t(
          'newsStory.summaryHelp',
          'Optional. One or two sentences on what happened. Leave blank to show none.',
        )}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {t('common.save', 'Save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          {t('common.cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
}
