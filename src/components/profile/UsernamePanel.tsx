import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UsernameSelector } from '@/components/auth/UsernameSelector';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface UsernamePanelProps {
  username: string | null;
  autoAssigned?: boolean;
  onChanged: (username: string) => void;
}

/**
 * Username with the change policy made explicit: claim is free, then one
 * change per rolling 12 months (the old handle is held + redirected for
 * 90 days). Auto-assigned handles get one free change. Safety changes
 * (deadname, harassment) go through support and are never questioned.
 */
export function UsernamePanel({ username, autoAssigned, onChanged }: UsernamePanelProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(!username);
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    if (!pending) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('change_username' as never, {
      new_username: pending,
    } as never);
    setSaving(false);
    const result = data as { ok?: boolean; error?: string; next_change_at?: string } | null;
    if (error || !result?.ok) {
      const code = result?.error;
      let description = 'Could not change username. Try again.';
      if (code === 'unavailable') description = 'That username is taken or reserved.';
      if (code === 'rate_limited') {
        const next = result?.next_change_at ? new Date(result.next_change_at).toLocaleDateString() : 'later';
        description = `You can change your username once per year. Next change: ${next}.`;
      }
      toast({ title: 'Username not changed', description, variant: 'destructive' });
      return;
    }
    onChanged(pending);
    setEditing(false);
    setPending(null);
    toast({ title: 'Username updated', description: `You are now @${pending}.` });
  };

  if (!editing && username) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">@{username}</span>
          {autoAssigned && (
            <Badge variant="outline" className="rounded-badge">auto-assigned</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {autoAssigned
            ? 'We assigned this for you — your first change is free.'
            : 'Changeable once per year. Your old name is held and redirected for 90 days.'}
          {' '}Need a change for safety reasons (e.g. a deadname)? Contact support — no questions asked.
        </p>
        <div>
          <Button variant="outline" size="sm" className="rounded-element" onClick={() => setEditing(true)}>
            Change username
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {username && (
        <p className="text-xs text-muted-foreground">
          Changing from <span className="font-mono">@{username}</span>. This counts as your change
          for the next 12 months; the old name redirects for 90 days.
        </p>
      )}
      <UsernameSelector value={pending} onChange={setPending} />
      <div className="flex gap-2">
        <Button onClick={commit} disabled={!pending || saving} className="rounded-element">
          {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
          {username ? 'Confirm change' : 'Claim username'}
        </Button>
        {username && (
          <Button variant="outline" className="rounded-element" onClick={() => { setEditing(false); setPending(null); }}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
