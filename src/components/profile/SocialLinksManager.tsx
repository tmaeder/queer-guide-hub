import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Globe,
  Save,
  Plus,
  Star,
  Trash2,
  ArrowUp,
  ArrowDown,
  BadgeCheck,
  ShieldCheck,
  Copy,
  EyeOff,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { updateRowsBy } from '@/hooks/usePageFetchers';
import { supabase } from '@/integrations/supabase/client';
import {
  detectPlatform,
  displayHandle,
  fromLegacyLinks,
  isSensitivePlatform,
  normalizeUrl,
  toLegacyLinks,
  unavatarSource,
  type AccountVisibility,
  type SocialAccount,
} from '@/lib/socialAccounts';

const RESOLVE_ENDPOINT = 'https://img.queer.guide/avatar/resolve';

interface SocialLinksManagerProps {
  initialSocialLinks?: Record<string, unknown>;
  initialSocialAccounts?: unknown;
  onUpdate?: (accounts: SocialAccount[]) => void;
}

/** Resolve a platform avatar through our own worker (client never hits the
 *  social site). Returns a queer.guide-hosted URL or null. */
async function resolveAvatar(platform: string, handle: string | null): Promise<string | null> {
  const source = unavatarSource(platform);
  if (!source || !handle) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(RESOLVE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source, identifier: handle.replace(/^@/, '') }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  } catch {
    return null;
  }
}

export function SocialLinksManager({
  initialSocialLinks = {},
  initialSocialAccounts,
  onUpdate,
}: SocialLinksManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>(() =>
    Array.isArray(initialSocialAccounts) && initialSocialAccounts.length > 0
      ? (initialSocialAccounts as SocialAccount[])
      : fromLegacyLinks(initialSocialLinks),
  );
  const [quickAddUrl, setQuickAddUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSensitiveNotice, setShowSensitiveNotice] = useState(false);

  const detected = quickAddUrl.trim() ? detectPlatform(quickAddUrl) : null;

  const addAccount = async () => {
    if (!quickAddUrl.trim()) return;
    const url = normalizeUrl(quickAddUrl);
    const { platform, handle } = detectPlatform(url);
    const sensitive = isSensitivePlatform(platform);
    const account: SocialAccount = {
      platform,
      url,
      handle,
      verified: 'unverified',
      // Sensitive (adult/dating) links default to community, never public.
      visibility: sensitive ? 'community' : 'public',
      featured: accounts.length === 0 && !sensitive,
      embed_enabled: false,
      sensitive,
    };
    setAccounts((prev) => [...prev, account]);
    setQuickAddUrl('');
    if (sensitive) {
      setShowSensitiveNotice(true);
      return; // never fetch an avatar from an adult/dating site
    }

    // Resolve avatar in the background, then patch the matching row.
    const avatar = await resolveAvatar(platform, handle);
    if (avatar) {
      setAccounts((prev) =>
        prev.map((a) => (a.url === url && !a.avatar_url ? { ...a, avatar_url: avatar } : a)),
      );
    }
  };

  const removeAt = (index: number) =>
    setAccounts((prev) => prev.filter((_, i) => i !== index));

  const move = (index: number, dir: -1 | 1) =>
    setAccounts((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const setFeatured = (index: number) =>
    setAccounts((prev) => prev.map((a, i) => ({ ...a, featured: i === index })));

  const setVisibility = (index: number, visibility: AccountVisibility) =>
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, visibility } : a)));

  const [verifyingUrl, setVerifyingUrl] = useState<string | null>(null);
  const backlink = user ? `https://queer.guide/user/${user.id}` : '';

  const copyBacklink = async () => {
    if (!backlink) return;
    try {
      await navigator.clipboard.writeText(backlink);
      toast({ title: 'Copied', description: 'Paste this into the bio of the account you want to verify.' });
    } catch {
      /* clipboard unavailable */
    }
  };

  const verify = async (account: SocialAccount) => {
    setVerifyingUrl(account.url);
    try {
      const { data, error } = await supabase.functions.invoke('social-verify', {
        body: { url: account.url },
      });
      if (error) throw error;
      const result = data as { verified?: string; method?: string | null; reason?: string };
      if (result.verified && result.verified !== 'unverified') {
        setAccounts((prev) =>
          prev.map((a) =>
            a.url === account.url
              ? { ...a, verified: result.verified as SocialAccount['verified'], verification_method: result.method ?? null }
              : a,
          ),
        );
        toast({ title: 'Verified', description: `${account.platform} ownership confirmed.` });
      } else {
        toast({
          title: 'Not verified yet',
          description: result.reason || 'Add your profile link to the bio, then try again.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Verification failed',
        description: 'Save your links first, then verify. Some platforms can’t be read.',
        variant: 'destructive',
      });
    } finally {
      setVerifyingUrl(null);
    }
  };

  const save = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await updateRowsBy(
        'profiles',
        { col: 'user_id', val: user.id },
        { social_accounts: accounts, social_links: toLegacyLinks(accounts) },
      );
      if (error) throw error;
      toast({ title: 'Social profiles saved', description: 'Your links are up to date.' });
      onUpdate?.(accounts);
    } catch (error) {
      console.error('Error saving social accounts:', error);
      toast({
        title: 'Error',
        description: 'Failed to save. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          <h6 className="text-base font-semibold">Social profiles</h6>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Paste any social URL (e.g. https://bsky.app/profile/you.bsky.social)"
                value={quickAddUrl}
                onChange={(e) => setQuickAddUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAccount()}
                className="flex-1"
              />
              <Button onClick={addAccount} disabled={!quickAddUrl.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
            {detected && (
              <p className="text-sm text-muted-foreground">Detected: {detected.platform}</p>
            )}
          </div>

          {showSensitiveNotice && (
            <div className="flex items-start gap-2 rounded-element border border-border bg-muted px-2 py-2">
              <EyeOff size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              <p className="flex-1 text-xs text-muted-foreground">
                Adult & dating links default to <strong>community</strong> visibility (signed-in members)
                and show an 18+ badge to visitors. They’re never verified or embedded. Set visibility per
                link below, or raise to public if you choose.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Dismiss"
                onClick={() => setShowSensitiveNotice(false)}
              >
                <X size={14} />
              </Button>
            </div>
          )}

          {accounts.length > 0 && backlink && (
            <div className="flex flex-col gap-2 rounded-element border border-border bg-muted px-2 py-2">
              <p className="text-xs text-muted-foreground">
                To verify an account, add this link to its bio, then click Verify:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs">{backlink}</code>
                <Button type="button" variant="ghost" size="icon" aria-label="Copy profile link" onClick={copyBacklink}>
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          )}

          {accounts.length > 0 && (
            <ul className="flex flex-col gap-2">
              {accounts.map((account, index) => (
                <li
                  key={`${account.url}-${index}`}
                  className="flex items-center gap-2 rounded-element border border-border px-2 py-2"
                >
                  <Avatar style={{ width: 32, height: 32 }}>
                    {account.avatar_url ? (
                      <AvatarImage src={account.avatar_url} alt={account.platform} />
                    ) : null}
                    <AvatarFallback className="bg-muted">
                      <Globe style={{ width: 16, height: 16 }} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1 text-sm font-medium truncate">
                      {account.platform}
                      {account.verified === 'verified' && (
                        <BadgeCheck size={14} className="text-foreground" aria-label="Verified" />
                      )}
                      {account.verified === 'linked' && (
                        <ShieldCheck size={14} className="text-muted-foreground" aria-label="Self-linked" />
                      )}
                      {(account.sensitive || isSensitivePlatform(account.platform)) && (
                        <span className="inline-flex items-center gap-1 rounded-badge bg-muted px-1 text-2xs text-muted-foreground" aria-label="Sensitive — 18+">
                          <EyeOff size={11} />
                          18+
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {displayHandle(account)}
                    </span>
                  </span>
                  <Select
                    value={account.visibility ?? 'public'}
                    onValueChange={(v) => setVisibility(index, v as AccountVisibility)}
                  >
                    <SelectTrigger className="h-8 w-28 hidden sm:flex" aria-label="Who can see this">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="community">Community</SelectItem>
                      <SelectItem value="friends">Friends</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                  {!(account.sensitive || isSensitivePlatform(account.platform)) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={verifyingUrl === account.url || account.verified === 'verified'}
                      onClick={() => verify(account)}
                    >
                      {account.verified === 'verified'
                        ? 'Verified'
                        : verifyingUrl === account.url
                          ? 'Checking…'
                          : 'Verify'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={account.featured ? 'Featured' : 'Make featured'}
                    aria-pressed={account.featured}
                    onClick={() => setFeatured(index)}
                  >
                    <Star
                      size={16}
                      className={account.featured ? 'fill-foreground text-foreground' : 'text-muted-foreground'}
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Move down"
                    disabled={index === accounts.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() => removeAt(index)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
