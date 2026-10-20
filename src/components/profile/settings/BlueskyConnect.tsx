import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useBlueskyIdentity } from '@/hooks/useBlueskyIdentity';
import {
  connectBluesky,
  disconnectBluesky,
  handleResolvesTo,
  queerGuideHandleFor,
} from '@/lib/atprotoClient';
import { useProfile } from '@/hooks/useProfile';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { profileEditPath } from '@/lib/profileEditing';

/** Settings → Privacy: link a Bluesky account via atproto OAuth. */
export function BlueskyConnect() {
  const { identity, save, remove, setUseQueerGuideHandle, setPublishActivity } =
    useBlueskyIdentity();
  const { profile } = useProfile();
  const qgHandle = queerGuideHandleFor(profile?.username);
  const [verified, setVerified] = useState<boolean | null>(null);
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
        ) : null}
        {identity && (
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <Label htmlFor="publish-activity">Publish my activity to Bluesky</Label>
              <p className="text-xs text-muted-foreground">
                Your public check-ins, ratings, RSVPs and saves are written to your Bluesky account,
                where anyone can read them. Never for gated places, cruising venues or saunas, or
                places where being LGBTQ+ is criminalised. Turning this off stops new records; it
                does not delete ones already published.
              </p>
            </div>
            <Switch
              id="publish-activity"
              checked={!!identity.publish_activity}
              onCheckedChange={(on) => setPublishActivity.mutate(on)}
            />
          </div>
        )}
        {identity && (
          <div className="mt-6 flex flex-col gap-4 border-t border-border pt-4">
            {qgHandle ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="use-qg-handle">Use @{qgHandle} on Bluesky</Label>
                    <p className="text-xs text-muted-foreground">
                      Queer Guide answers Bluesky&apos;s handle check for this name. Turn it off and
                      the handle stops working at once.
                    </p>
                  </div>
                  <Switch
                    id="use-qg-handle"
                    checked={!!identity.use_queer_guide_handle}
                    onCheckedChange={(on) => {
                      setVerified(null);
                      setUseQueerGuideHandle.mutate(on);
                    }}
                  />
                </div>
                {identity.use_queer_guide_handle && (
                  <div className="flex flex-col gap-2 text-sm">
                    <p>
                      In Bluesky, open Settings → Account → Handle → &ldquo;I have my own
                      domain&rdquo;, choose &ldquo;No DNS panel&rdquo; and enter{' '}
                      <span className="font-bold">{qgHandle}</span>.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () =>
                          setVerified(await handleResolvesTo(qgHandle, identity.did))
                        }
                      >
                        Check
                      </Button>
                      {verified !== null && (
                        <span role="status" className="text-xs">
                          {verified
                            ? `Bluesky resolves @${qgHandle} to your account.`
                            : 'Not active yet — finish the step in Bluesky, then check again.'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                A queer.guide Bluesky handle needs a username made only of letters and numbers.
              </p>
            )}
          </div>
        )}
        {identity ? null : (
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
