import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useBlueskyIdentity } from '@/hooks/useBlueskyIdentity';
import { connectBluesky, disconnectBluesky } from '@/lib/atprotoClient';
import { useAuth } from '@/hooks/useAuth';
import { profileEditPath } from '@/lib/profileEditing';

/** Settings → Privacy: link a Bluesky account via atproto OAuth. */
export function BlueskyConnect() {
  const { identity, save, remove } = useBlueskyIdentity();
  const { user } = useAuth();
  const { toast } = useToast();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setBusy(true);
    try {
      await connectBluesky(handle, user ? profileEditPath(user.id, 'privacy') : '/hub');
    } catch (err) {
      setBusy(false);
      toast({
        title: 'Could not reach Bluesky',
        description: err instanceof Error ? err.message : 'Check the handle and try again.',
        variant: 'destructive',
      });
    }
  };

  const disconnect = async () => {
    if (!identity) return;
    await disconnectBluesky(identity.did);
    remove.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bluesky</CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect your Bluesky account to post there from Queer Guide. Nothing is shared until you
          choose it for a post. Queer Guide never sees your Bluesky password.
        </p>
      </CardHeader>
      <CardContent>
        {identity ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">
              Connected as <span className="font-bold">@{identity.handle}</span>
            </p>
            <Button
              variant="outline"
              onClick={disconnect}
              disabled={remove.isPending || save.isPending}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={connect}>
            <Label htmlFor="bluesky-handle">Bluesky handle</Label>
            <div className="flex gap-2">
              <Input
                id="bluesky-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="name.bsky.social"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
              <Button type="submit" disabled={busy || !handle.trim()}>
                {busy ? 'Opening Bluesky…' : 'Connect'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
