import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
      <Stack direction="row" spacing={0.5}>
        {adds > 0 && <Badge variant="default">+{adds}</Badge>}
        {rems > 0 && <Badge variant="destructive">-{rems}</Badge>}
      </Stack>
    );
  }
  return <Badge variant="secondary">changed</Badge>;
}

function ChangeRow({ keyName, change }: { keyName: string; change: AxisChange }) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography variant="subtitle2" sx={{ minWidth: 200, fontFamily: 'monospace' }}>
          {keyName}
        </Typography>
        <ChangePill change={change} />
      </Stack>
      {change.kind === 'changed' && (change.added?.length || change.removed?.length) ? (
        <Stack direction="row" spacing={2} sx={{ ml: 26, mt: 0.5 }}>
          {change.added && change.added.length > 0 && (
            <Typography variant="caption" sx={{ color: '#10b981' }}>
              +{change.added.map((a) => JSON.stringify(a)).join(', ')}
            </Typography>
          )}
          {change.removed && change.removed.length > 0 && (
            <Typography variant="caption" sx={{ color: '#ef4444' }}>
              −{change.removed.map((a) => JSON.stringify(a)).join(', ')}
            </Typography>
          )}
        </Stack>
      ) : null}
      {change.kind === 'changed' && change.nested ? (
        <Box sx={{ ml: 26, mt: 0.5 }}>
          {Object.entries(change.nested).map(([k, c]) => (
            <Typography key={k} variant="caption" component="div" color="text.secondary">
              <code>{k}</code>: {c.kind}
            </Typography>
          ))}
        </Box>
      ) : null}
    </Box>
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
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-end">
        <TextField
          select
          label="Index"
          value={index}
          onChange={(e) => setIndex(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {INDEXES.map((ix) => (
            <MenuItem key={ix} value={ix}>
              {ix}
            </MenuItem>
          ))}
        </TextField>
        <Button onClick={refresh} variant="outline" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
        <Box sx={{ flex: 1 }} />
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
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Tabs value={view} onChange={(_, v: typeof view) => setView(v)}>
        <Tab label={`Diff${diff.hasChanges ? ` (${diff.summary.length})` : ''}`} value="diff" />
        <Tab label="Desired" value="desired" />
        <Tab label="Applied" value="applied" />
        <Tab label={`Versions (${versions.length})`} value="versions" />
      </Tabs>

      {view === 'diff' && (
        <Card>
          <CardContent>
            {desired === null && applied === null ? (
              <Typography color="text.secondary">No settings on either side yet.</Typography>
            ) : !diff.hasChanges ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Badge variant="default">in sync</Badge>
                <Typography variant="body2" color="text.secondary">
                  Desired (DB) and applied (Meili) match for{' '}
                  <code>{index}</code> across all monitored keys.
                </Typography>
              </Stack>
            ) : (
              <>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <Badge variant="destructive">drift</Badge>
                  <Typography variant="body2">
                    {diff.summary.length} key(s) differ between desired (DB) and applied (Meili).
                  </Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {Object.entries(diff.changes)
                    .filter(([, c]) => c.kind !== 'unchanged')
                    .map(([k, c]) => (
                      <ChangeRow key={k} keyName={k} change={c} />
                    ))}
                </Stack>
              </>
            )}
            {desired === null && applied !== null && (
              <Box sx={{ mt: 3 }}>
                <Alert severity="info">
                  No desired version yet. Click <strong>Snapshot live → desired</strong> to anchor
                  history without changing Meilisearch.
                </Alert>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {view === 'desired' && (
        <Card>
          <CardContent>
            {desiredVersion && (
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                version {desiredVersion.version} ·{' '}
                {new Date(desiredVersion.created_at).toLocaleString()} ·{' '}
                {desiredVersion.comment ?? 'no comment'}
              </Typography>
            )}
            <SettingsJson value={desired} />
          </CardContent>
        </Card>
      )}

      {view === 'applied' && (
        <Card>
          <CardContent>
            <SettingsJson value={applied} />
          </CardContent>
        </Card>
      )}

      {view === 'versions' && (
        <Stack spacing={1}>
          {versions.length === 0 ? (
            <Typography color="text.secondary">No versions on file.</Typography>
          ) : (
            versions.map((v) => (
              <Card key={v.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Badge variant="secondary">v{v.version}</Badge>
                        <Badge variant="secondary">{v.channel}</Badge>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(v.created_at).toLocaleString()}
                        </Typography>
                      </Stack>
                      {v.comment && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {v.comment}
                        </Typography>
                      )}
                    </Box>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rollbackTo(v.version)}
                      disabled={busy === `rb-${v.version}`}
                    >
                      {busy === `rb-${v.version}` ? 'Rolling…' : 'Roll back to this'}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </Stack>
      )}
    </Stack>
  );
}

function SettingsJson({ value }: { value: SettingsObject | SettingsValue | null }) {
  return (
    <pre
      style={{
        fontSize: 12,
        maxHeight: 600,
        overflow: 'auto',
        background: 'rgba(0,0,0,0.04)',
        padding: 12,
        margin: 0,
      }}
    >
      {value === null ? '(none)' : JSON.stringify(value, null, 2)}
    </pre>
  );
}
