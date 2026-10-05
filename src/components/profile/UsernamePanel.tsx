import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UsernameSelector } from '@/components/auth/UsernameSelector';
import { useToast } from '@/hooks/use-toast';
import { untypedRpc } from '@/integrations/supabase/untyped';

interface UsernamePanelProps {
  username: string | null;
  autoAssigned?: boolean;
  onChanged: (username: string) => void;
}

/**
 * Username with the change policy made explicit: claim is free, then one
 * change per rolling 12 months (the old handle is held + redirected for
 * 90 days), with 30 days afterwards to correct it. Auto-assigned handles get
 * one free change. Safety changes (deadname, harassment) go through support
 * and are never questioned.
 *
 * Every string is i18n'd under `profile.username.*`. It was hardcoded English
 * in an 11-language app until 99991791139641's follow-up, so the other ten
 * locales showed English here -- including the policy sentence a user has to
 * read BEFORE spending a change they cannot take back for a year.
 *
 * The handle inside `changingFrom` and `updatedBody` is an interpolation, not
 * a styled <span>: splitting the sentence around a mono-styled fragment fixes
 * English word order, which breaks ja/ko/ar/zh. One inline handle loses its
 * mono face; eleven languages keep a grammatical sentence.
 */
export function UsernamePanel({ username, autoAssigned, onChanged }: UsernamePanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editing, setEditing] = useState(!username);
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    if (!pending) return;
    setSaving(true);
    const { data, error } = await untypedRpc<{
      ok?: boolean;
      error?: string;
      next_change_at?: string;
    }>('change_username', { new_username: pending });
    setSaving(false);
    const result = data;
    if (error || !result?.ok) {
      const code = result?.error;
      let description = t('profile.username.errorGeneric');
      if (code === 'unavailable') description = t('profile.username.errorUnavailable');
      if (code === 'rate_limited') {
        const next = result?.next_change_at
          ? new Date(result.next_change_at).toLocaleDateString()
          : t('profile.username.rateLimitedFallbackDate');
        description = t('profile.username.errorRateLimited', { date: next });
      }
      toast({ title: t('profile.username.notChangedTitle'), description, variant: 'destructive' });
      return;
    }
    onChanged(pending);
    setEditing(false);
    setPending(null);
    toast({
      title: t('profile.username.updatedTitle'),
      description: t('profile.username.updatedBody', { username: pending }),
    });
  };

  if (!editing && username) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">@{username}</span>
          {autoAssigned && (
            <Badge variant="outline" className="rounded-badge">
              {t('profile.username.autoAssignedBadge')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {autoAssigned
            ? t('profile.username.policyAutoAssigned')
            : t('profile.username.policyStandard')}{' '}
          {t('profile.username.safetyNote')}
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-element"
            onClick={() => setEditing(true)}
          >
            {t('profile.username.change')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {username && (
        <p className="text-xs text-muted-foreground">
          {t('profile.username.changingFrom', { username })}
        </p>
      )}
      <UsernameSelector value={pending} onChange={setPending} />
      <div className="flex gap-2">
        <Button onClick={commit} disabled={!pending || saving} className="rounded-element">
          {saving && <TrackLoader size={16} className="mr-2" />}
          {username ? t('profile.username.confirmChange') : t('profile.username.claim')}
        </Button>
        {username && (
          <Button
            variant="outline"
            className="rounded-element"
            onClick={() => {
              setEditing(false);
              setPending(null);
            }}
          >
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
