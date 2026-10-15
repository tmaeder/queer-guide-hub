import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useRedirectDomainChoices } from '@/hooks/useRedirectDomainChoices';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
interface AppRow {
  id: string;
  domainId: string | null;
  hostname: string;
  label: string;
  platform: 'ios' | 'android';
  appId: string;
  fingerprints: string[];
  paths: string[];
  enabled: boolean;
  version: string;
  updatedAt: string;
}
export function RedirectNativeApps() {
  const { user } = useAuth();
  return user ? <AppRegistry key={user.id} userId={user.id} /> : null;
}
function AppForm({
  row,
  userId,
  onSaved,
  onReload,
}: {
  row: AppRow | null;
  userId: string;
  onSaved: () => Promise<void>;
  onReload: () => void;
}) {
  const client = useQueryClient();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const selection = useRedirectDomainChoices(
    userId,
    row ? { id: row.domainId, hostname: row.hostname } : undefined,
    row?.domainId ?? null,
  );
  const [label, setLabel] = useState(row?.label ?? ''),
    [platform, setPlatform] = useState<'ios' | 'android'>(row?.platform ?? 'ios'),
    [appId, setAppId] = useState(row?.appId ?? ''),
    [fingerprints, setFingerprints] = useState(row?.fingerprints.join('\n') ?? ''),
    [paths, setPaths] = useState(row?.paths.join('\n') ?? '/go/*'),
    [enabled, setEnabled] = useState(row?.enabled ?? false);
  const save = useMutation({
    onError: () => {
      if (alive.current)
        void client.invalidateQueries({ queryKey: ['redirect-native-apps', userId] });
    },
    gcTime: 0,
    retry: false,
    mutationFn: () =>
      memberRedirectApi(row ? '/apps/' + row.id : '/apps', row ? 'PATCH' : 'POST', {
        ...(row ? { version: row.version } : {}),
        label,
        platform,
        appId,
        domainId: selection.domainId,
        fingerprints: platform === 'android' ? fingerprints.split(/[\s,]+/).filter(Boolean) : [],
        paths: paths
          .split(/\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean),
        enabled,
      }),
    onSuccess: async () => {
      if (alive.current) await onSaved();
    },
  });
  return (
    <form
      className="space-y-4 rounded-element border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h4 className="font-semibold">{row ? 'Edit app binding' : 'Register app'}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="app-label">App label</Label>
          <Input
            id="app-label"
            required
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="app-platform">Platform</Label>
          <select
            id="app-platform"
            className="block w-full rounded-element border bg-background p-2"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as 'ios' | 'android');
              setAppId('');
              setFingerprints('');
            }}
          >
            <option value="ios">iOS</option>
            <option value="android">Android</option>
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="app-domain">Association host</Label>
        <select
          id="app-domain"
          className="block w-full rounded-element border bg-background p-2"
          value={selection.selected}
          disabled={selection.query.isPending}
          onChange={(e) => {
            selection.setSelected(e.target.value);
            setPaths(e.target.value ? '/*' : '/go/*');
          }}
        >
          <option value="">queer.guide and www.queer.guide</option>
          {row?.domainId && !selection.query.data?.data.some((d) => d.id === row.domainId) && (
            <option value={row.domainId}>{row.hostname} (currently unavailable)</option>
          )}
          {selection.query.data?.data.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.hostname}
            </option>
          ))}
        </select>
        {selection.query.isError && <p role="alert">{selection.query.error.message}</p>}
      </div>
      <div>
        <Label htmlFor="app-identifier">
          {platform === 'ios' ? 'iOS application identifier' : 'Android package name'}
        </Label>
        <Input
          id="app-identifier"
          required
          maxLength={255}
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          autoComplete="off"
        />
        <p className="text-sm text-muted-foreground">
          {platform === 'ios'
            ? 'Use the application identifier prefix and bundle ID from your signed app, such as ABCDE12345.org.yourcompany.app.'
            : 'Use the application ID from your release build.'}
        </p>
      </div>
      {platform === 'android' && (
        <div>
          <Label htmlFor="app-fingerprints">SHA-256 release signing fingerprints</Label>
          <Textarea
            id="app-fingerprints"
            required
            value={fingerprints}
            maxLength={1100}
            onChange={(e) => setFingerprints(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            One fingerprint per line, up to ten. Use Play App Signing fingerprints when applicable.
          </p>
        </div>
      )}
      <div>
        <Label htmlFor="app-paths">Allowed paths</Label>
        <Textarea
          id="app-paths"
          required
          value={paths}
          maxLength={5200}
          onChange={(e) => setPaths(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          One pattern per line, up to twenty. Built-in hosts allow /go/ paths only. Changing the
          host resets these patterns.
        </p>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Publish this app association
      </label>
      <p className="text-sm text-muted-foreground">
        Your app must resolve incoming short links and enforce password, expiry and visit limits
        before opening content. Publishing a file alone does not implement that flow. Custom hosts
        publish only while their domain checks remain ready. Devices may cache earlier associations.
      </p>
      {save.isError && <p role="alert">{save.error.message} Reload before trying again.</p>}
      <div className="flex gap-2">
        <Button disabled={save.isPending || save.isError || !selection.valid}>
          {save.isPending ? 'Saving…' : row ? 'Save app binding' : 'Register app'}
        </Button>
        <Button type="button" variant="outline" disabled={save.isPending} onClick={onReload}>
          {row ? 'Reload app settings' : 'Reset form'}
        </Button>
      </div>
    </form>
  );
}
function AppRegistry({ userId }: { userId: string }) {
  const client = useQueryClient(),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [editing, setEditing] = useState<AppRow | null>(null),
    [removing, setRemoving] = useState<AppRow | null>(null),
    [epoch, setEpoch] = useState(0);
  const query = useQuery({
    queryKey: ['redirect-native-apps', userId],
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const rows: AppRow[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await memberRedirectApi<{ data: AppRow[]; count: number }>(
          '/apps?offset=' + offset,
          'GET',
          undefined,
          signal,
        );
        rows.push(...page.data);
        if (rows.length >= page.count) return rows;
        if (!page.data.length) throw new Error('Incomplete app registry page');
      }
    },
  });
  const remove = useMutation({
    onError: () => {
      if (alive.current)
        void client.invalidateQueries({ queryKey: ['redirect-native-apps', userId] });
    },
    gcTime: 0,
    retry: false,
    mutationFn: (row: AppRow) =>
      memberRedirectApi('/apps/' + row.id, 'DELETE', { version: row.version }),
    onSuccess: async () => {
      if (!alive.current) return;
      setRemoving(null);
      await client.invalidateQueries({ queryKey: ['redirect-native-apps', userId] });
    },
  });
  const reload = async () => {
    const result = await query.refetch();
    if (!alive.current || result.isError) return;
    setEditing(editing ? (result.data?.find((row) => row.id === editing.id) ?? null) : null);
    setEpoch((n) => n + 1);
  };
  return (
    <section aria-label="Native app associations" className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Native app associations</h3>
      <p className="text-sm">
        Register your actual signed app to serve Apple and Android association files. App
        installation, native routing and deferred attribution also require app integration.
      </p>
      {query.isPending ? (
        <p role="status">Loading app bindings…</p>
      ) : query.isError ? (
        <div>
          <p role="alert">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry app bindings
          </Button>
        </div>
      ) : (
        <>
          <AppForm
            key={(editing?.id ?? 'new') + ':' + epoch}
            row={editing}
            userId={userId}
            onReload={() => void reload()}
            onSaved={async () => {
              if (!alive.current) return;
              setEditing(null);
              setEpoch((n) => n + 1);
              await client.invalidateQueries({ queryKey: ['redirect-native-apps', userId] });
            }}
          />
          {editing && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setEpoch((n) => n + 1);
              }}
            >
              Cancel app edit
            </Button>
          )}
          {query.data?.map((row) => (
            <div key={row.id} className="space-y-2 border-t py-4">
              <p className="font-medium">
                {row.label} · {row.platform} · {row.enabled ? 'Enabled' : 'Disabled'}
              </p>
              <p className="break-all text-sm">
                {row.appId} · {row.hostname}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(row);
                    setEpoch((n) => n + 1);
                  }}
                >
                  Edit {row.label}
                </Button>
                <Button variant="ghost" onClick={() => setRemoving(row)}>
                  Remove {row.label}
                </Button>
                <a
                  className="break-all text-sm underline"
                  href={
                    'https://' +
                    row.hostname +
                    '/.well-known/' +
                    (row.platform === 'ios' ? 'apple-app-site-association' : 'assetlinks.json')
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  View association file
                </a>
              </div>
            </div>
          ))}
          {removing && (
            <div className="space-y-2 rounded-element border p-4">
              <p>
                Remove {removing.label} from {removing.hostname}? Devices may retain cached
                associations.
              </p>
              <Button
                variant="destructive"
                disabled={remove.isPending || remove.isError}
                onClick={() => remove.mutate(removing)}
              >
                Confirm app removal
              </Button>
              <Button
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  setRemoving(null);
                  remove.reset();
                }}
              >
                Cancel removal
              </Button>
              {remove.isError && (
                <p role="alert">{remove.error.message} Cancel and reload before trying again.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
