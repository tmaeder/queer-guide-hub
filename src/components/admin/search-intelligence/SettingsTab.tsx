import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';
import {
  diffSettings,
  filterRelevantChanges,
  AxisChange,
  SettingsObject,
  SettingsValue,
} from '@/lib/settingsDiff';

const INDEXES = [
  'venues',
  'events',
  'cities',
  'countries',
  'news',
  'marketplace',
  'personalities',
  'tags',
  'queer_villages',
  'hotels',
  'festivals',
];

interface SettingsResponse {
  source: 'desired' | 'applied';
  settings: SettingsObject | null;
  version?: {
    id: number;
    version: number;
    comment: string | null;
    created_at: string;
  };
}

interface VersionRow {
  id: number;
  version: number;
  channel: string;
  comment: string | null;
  settings: SettingsObject;
  created_at: string;
  created_by: string | null;
}

const IGNORED_DIFF_KEYS = ['embedders'];

function ChangePill({ change }: { change: AxisChange }) {
  if (change.kind === 'unchanged') {
    return <Badge variant="secondary">unchanged</Badge>;
  }
  if (change.kind === 'added') {
    return <Badge variant="default">added</Badge>;
  }
  if (change.kind === 'removed') {
    return <Badge variant="destructive">removed</Badge>;
  }
  if (change.reordered) {
    return <Badge variant="secondary">reordered</Badge>;
  }
  const adds = change.added?.length ?? 0;
  const rems = change.removed?.length ?? 0;
  if (adds || rems) {
    return (
      <div className="flex flex-row gap-1">
        {adds > 0 && <Badge variant="default">+{adds}</Badge>}
        {rems > 0 && <Badge variant="destructive">-{rems}</Badge>}
      </div>
    );
  }
  return <Badge variant="secondary">changed</Badge>;
}

function ChangeRow({ keyName, change }: { keyName: string; change: AxisChange }) {
  return (
    <div>
      <div className="flex flex-row items-center gap-3">
        <p className="text-sm font-semibold min-w-[200px] font-mono">{keyName}</p>
        <ChangePill change={change} />
      </div>
      {change.kind === 'changed' && (change.added?.length || change.removed?.length) ? (
        <div className="flex flex-row gap-4 ml-[208px] mt-1">
          {change.added && change.added.length > 0 && (
            <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
              +{change.added.map((a) => JSON.stringify(a)).join(', ')}
            </span>
          )}
          {change.removed && change.removed.length > 0 && (
            <span className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
              −{change.removed.map((a) => JSON.stringify(a)).join(', ')}
            </span>
          )}
        </div>
      ) : null}
      {change.kind === 'changed' && change.nested ? (
        <div className="ml-[208px] mt-1">
          {Object.entries(change.nested).map(([k, c]) => (
            <div key={k} className="text-xs text-muted-foreground">
              <code>{k}</code>: {c.kind}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SettingsTab() {
  const [index, setIndex] = useState('venues');
  const [view, setView] = useState<'diff' | 'desired' | 'applied' | 'versions'>('diff');
  const [desired, setDesired] = useState<SettingsObject | null>(null);
  const [applied, setApplied] = useState<SettingsObject | null>(null);
  const [desiredVersion, setDesiredVersion] = useState<SettingsResponse['version'] | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDesired(null);
    setApplied(null);
    setVersions([]);
    const [d, a, vs] = await Promise.all([
      callSearchIntelligence<SettingsResponse>(`indexes/${index}/settings`, {
        searchParams: { source: 'desired' },
      }),
      callSearchIntelligence<SettingsResponse>(`indexes/${index}/settings`, {
        searchParams: { source: 'applied' },
      }),
      callSearchIntelligence<VersionRow[]>(`indexes/${index}/settings/versions`),
    ]);
    if (d.success) {
      setDesired(d.data.settings);
      setDesiredVersion(d.data.version ?? null);
    } else {
      setError(d.error);
    }
    if (a.success) {
      setApplied(a.data.settings);
    } else if (!error) {
      setError(a.error);
    }
    if (vs.success) setVersions(vs.data);
    setLoading(false);
  }, [index, error]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const applyDesired = async () => {
    if (!desired) {
      setError('No desired settings to apply');
      return;
    }
    if (!confirm(`Apply desired settings to Meilisearch index "${index}"?`)) return;
    setBusy('apply');
    const res = await callSearchIntelligence(`indexes/${index}/settings`, {
      method: 'PATCH',
      body: { settings: desired, comment: 'apply current desired (drift resolve)', apply: true },
    });
    if (!res.success) setError(res.error);
    else await refresh();
    setBusy(null);
  };

  const importApplied = async () => {
    if (!applied) {
      setError('No applied settings available');
      return;
    }
    setBusy('import');
    const res = await callSearchIntelligence(`indexes/${index}/settings`, {
      method: 'PATCH',
      body: {
        settings: applied,
        comment: 'snapshot of applied (live)',
        apply: false,
      },
    });
    if (!res.success) setError(res.error);
    else await refresh();
    setBusy(null);
  };

  const rollbackTo = async (version: number) => {
    if (!confirm(`Roll back to version ${version}? A new version will be created.`)) return;
    setBusy(`rb-${version}`);
    const res = await callSearchIntelligence(`indexes/${index}/settings/rollback`, {
      method: 'POST',
      body: { version, apply: true, confirm: true },
    });
    if (!res.success) setError(res.error);
    else await refresh();
    setBusy(null);
  };

  const rawDiff = diffSettings(applied, desired);
  const diff = filterRelevantChanges(rawDiff, { ignoreKeys: IGNORED_DIFF_KEYS });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="space-y-1.5 min-w-[200px]">
          <Label>Index</Label>
          <Select value={index} onValueChange={setIndex}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDEXES.map((ix) => (
                <SelectItem key={ix} value={ix}>
                  {ix}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={refresh} variant="outline" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
        <div className="flex-1" />
        {desired === null && applied !== null && (
          <Button onClick={importApplied} disabled={busy === 'import'} variant="outline">
            {busy === 'import' ? 'Importing…' : 'Snapshot live → desired'}
          </Button>
        )}
        {desired !== null && diff.hasChanges && (
          <Button onClick={applyDesired} disabled={busy === 'apply'}>
            {busy === 'apply' ? 'Applying…' : 'Apply desired → Meili'}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="diff">
            Diff{diff.hasChanges ? ` (${diff.summary.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="desired">Desired</TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="diff">
          <Card>
            <CardContent>
              {desired === null && applied === null ? (
                <p className="text-muted-foreground">No settings on either side yet.</p>
              ) : !diff.hasChanges ? (
                <div className="flex flex-row items-center gap-2">
                  <Badge variant="default">in sync</Badge>
                  <p className="text-sm text-muted-foreground">
                    Desired (DB) and applied (Meili) match for <code>{index}</code> across all
                    monitored keys.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-row gap-2 items-center mb-4">
                    <Badge variant="destructive">drift</Badge>
                    <p className="text-sm">
                      {diff.summary.length} key(s) differ between desired (DB) and applied (Meili).
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {Object.entries(diff.changes)
                      .filter(([, c]) => c.kind !== 'unchanged')
                      .map(([k, c]) => (
                        <ChangeRow key={k} keyName={k} change={c} />
                      ))}
                  </div>
                </>
              )}
              {desired === null && applied !== null && (
                <div className="mt-6">
                  <Alert>
                    <AlertDescription>
                      No desired version yet. Click <strong>Snapshot live → desired</strong> to
                      anchor history without changing Meilisearch.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="desired">
          <Card>
            <CardContent>
              {desiredVersion && (
                <p className="text-xs text-muted-foreground block mb-2">
                  version {desiredVersion.version} ·{' '}
                  {new Date(desiredVersion.created_at).toLocaleString()} ·{' '}
                  {desiredVersion.comment ?? 'no comment'}
                </p>
              )}
              <SettingsJson value={desired} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applied">
          <Card>
            <CardContent>
              <SettingsJson value={applied} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions">
          <div className="flex flex-col gap-2">
            {versions.length === 0 ? (
              <p className="text-muted-foreground">No versions on file.</p>
            ) : (
              versions.map((v) => (
                <Card key={v.id}>
                  <CardContent>
                    <div className="flex flex-row justify-between items-center">
                      <div>
                        <div className="flex flex-row items-center gap-2">
                          <Badge variant="secondary">v{v.version}</Badge>
                          <Badge variant="secondary">{v.channel}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(v.created_at).toLocaleString()}
                          </span>
                        </div>
                        {v.comment && <p className="text-sm mt-1">{v.comment}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rollbackTo(v.version)}
                        disabled={busy === `rb-${v.version}`}
                      >
                        {busy === `rb-${v.version}` ? 'Rolling…' : 'Roll back to this'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsJson({ value }: { value: SettingsObject | SettingsValue | null }) {
  return (
    <pre
      style={{
        fontSize: 12,
        maxHeight: 600,
        overflow: 'auto',
        background: 'hsl(var(--foreground) / 0.04)',
        padding: 12,
        margin: 0,
      }}
    >
      {value === null ? '(none)' : JSON.stringify(value, null, 2)}
    </pre>
  );
}
