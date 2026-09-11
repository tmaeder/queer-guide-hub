import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useStyleguideAdmin,
  useStyleguidePreview,
  useStyleguideVersions,
  type VoiceProfile,
} from '@/hooks/useStyleguide';

/**
 * Preview, publish, and the version history.
 *
 * The preview is compiled SERVER-SIDE by the same function publishing uses, not
 * reassembled in the browser from the same rows. A client-side approximation
 * would be a second implementation of the compiler, and the first time the two
 * disagreed an editor would approve text that was never sent.
 */

const PROFILE_HELP: Record<VoiceProfile, string> = {
  full: 'Everything, worked examples included. Long-form writing — a city description, an editorial hook.',
  core: 'Rules and terminology, no worked examples. Field-level rewriting.',
  compact:
    'Binding rules and banned words only. High-volume classification, where a six-thousand-token system prompt is a bill rather than a style decision.',
};

export function PublishTab({ activeVersion }: { activeVersion: string | null }) {
  const [profile, setProfile] = useState<VoiceProfile>('full');
  const [bump, setBump] = useState<'major' | 'minor' | 'patch'>('patch');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const preview = useStyleguidePreview(profile);
  const versions = useStyleguideVersions();
  const { publish, activate } = useStyleguideAdmin();

  const published = versions.data?.find((v) => v.is_active)?.doc?.prompts?.[profile];
  // "Unpublished changes" compares the compiled TEXT, not a row timestamp: an
  // edit that does not change the compiled output (a sort_order nudge, a typo
  // in a field the compiler drops) is not a change anyone needs to publish.
  const dirty = Boolean(preview.data && published && preview.data !== published);

  const doPublish = async () => {
    try {
      const version = await publish.mutateAsync({ bump, note });
      toast.success(`Published v${version}`);
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const doActivate = async (version: string) => {
    try {
      await activate.mutateAsync(version);
      toast.success(`v${version} is now the active version`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not activate');
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(preview.data ?? '');
    setCopied(true);
    toast.success('Prompt copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="text-title font-bold">Publish</h3>
            {activeVersion ? <Badge variant="outline">live: v{activeVersion}</Badge> : null}
            {dirty ? <Badge variant="destructive">unpublished changes</Badge> : null}
          </div>

          <p className="mb-4 max-w-prose text-13 text-muted-foreground">
            Publishing freezes the current rules as a new version and points every content pipeline
            and the public page at it. Until you do, your edits are visible only here.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Label htmlFor="sg-bump">Release</Label>
              <Select value={bump} onValueChange={(v) => setBump(v as typeof bump)}>
                <SelectTrigger id="sg-bump">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patch">Patch — wording only</SelectItem>
                  <SelectItem value="minor">Minor — added or relaxed a rule</SelectItem>
                  <SelectItem value="major">Major — reversed or removed a rule</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-64 flex-1">
              <Label htmlFor="sg-note">What changed</Label>
              <Input
                id="sg-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Added the anti-racist specificity rule"
              />
            </div>
            <Button onClick={doPublish} loading={publish.isPending}>
              Publish
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-title font-bold">Preview</h3>
            <div className="flex items-center gap-2">
              <Select value={profile} onValueChange={(v) => setProfile(v as VoiceProfile)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="compact">Compact</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={copy} disabled={!preview.data}>
                {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
                Copy
              </Button>
            </div>
          </div>

          <p className="mb-4 max-w-prose text-13 text-muted-foreground">
            {PROFILE_HELP[profile]}{' '}
            {preview.data ? `${preview.data.length.toLocaleString()} characters.` : null}
          </p>

          {preview.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : preview.isError ? (
            <p className="text-13 text-destructive">
              Could not compile a preview: {(preview.error as Error).message}
            </p>
          ) : (
            <pre className="max-h-[32rem] overflow-auto rounded-element bg-muted p-4 text-13">
              <code>{preview.data}</code>
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-title font-bold">Versions</h3>
          {versions.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul>
              {(versions.data ?? []).map((v) => (
                <li
                  key={v.version}
                  className="flex flex-wrap items-center gap-2 border-b border-border-hairline py-4 last:border-b-0"
                >
                  <span className="font-bold">v{v.version}</span>
                  {v.is_active ? <Badge>active</Badge> : null}
                  <span className="text-13 text-muted-foreground">
                    {new Date(v.published_at).toLocaleDateString()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-13">{v.note ?? ''}</span>
                  {!v.is_active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => doActivate(v.version)}
                      loading={activate.isPending}
                    >
                      Make active
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 max-w-prose text-13 text-muted-foreground">
            Versions are immutable, so making an older one active gives every pipeline exactly the
            text it had before. The newest fifty are kept.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
