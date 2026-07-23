import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { contrastVerdict } from '@/lib/wcagContrast';
import { CONTRAST_PAIRS, resolveColor } from './tokenCatalog';
import type { DesignSettingsController } from './useDesignSettings';

type AuditArtifact = {
  generated_at: string;
  token_count: number;
  usage: Array<{ token: string; count: number }>;
  unused: string[];
  eslint: { design_rule_suppressions: number };
  docs: { missing_from_docs: string[]; stale_in_docs: string[] };
};

const STALE_AFTER_DAYS = 14;

function StatCard({ label, value, flagged }: { label: string; value: string | number; flagged?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-headline font-display ${flagged ? 'text-destructive' : ''}`}>{value}</p>
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export function DesignAuditTab({ controller }: { controller: DesignSettingsController }) {
  const artifact = useQuery({
    queryKey: ['design-audit-artifact'],
    queryFn: async (): Promise<{ data: AuditArtifact; staleDays: number } | null> => {
      const res = await fetch('/design-audit.json');
      if (!res.ok) return null;
      const data = (await res.json()) as AuditArtifact;
      const staleDays = Math.floor(
        (Date.now() - new Date(data.generated_at).getTime()) / 86_400_000,
      );
      return { data, staleDays };
    },
  });

  // Live WCAG contrast on the DRAFT, both modes.
  const contrastRows = CONTRAST_PAIRS.flatMap((pair) =>
    (['light', 'dark'] as const).map((mode) => ({
      pair,
      mode,
      verdict: contrastVerdict(
        resolveColor(controller.draft, pair.fg, mode),
        resolveColor(controller.draft, pair.bg, mode),
      ),
    })),
  );
  const contrastFailures = contrastRows.filter((r) => r.verdict && !r.verdict.aa).length;

  const data = artifact.data?.data ?? null;
  const generatedAt = data ? new Date(data.generated_at) : null;
  const staleDays = artifact.data?.staleDays ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Tokens defined" value={data?.token_count ?? '—'} />
        <StatCard label="Overridden (draft)" value={controller.overrideCount} />
        <StatCard
          label="Unused in code"
          value={data?.unused.length ?? '—'}
          flagged={(data?.unused.length ?? 0) > 0}
        />
        <StatCard label="Contrast failures (AA)" value={contrastFailures} flagged={contrastFailures > 0} />
        <StatCard
          label="Lint suppressions"
          value={data?.eslint.design_rule_suppressions ?? '—'}
          flagged={(data?.eslint.design_rule_suppressions ?? 0) > 0}
        />
      </div>

      {staleDays !== null && staleDays > STALE_AFTER_DAYS && (
        <p className="rounded-element border p-4 text-13 text-muted-foreground">
          Audit artifact is {staleDays} days old — regenerate with{' '}
          <code className="font-mono">node scripts/design-audit.mjs</code>.
        </p>
      )}
      {artifact.isSuccess && !data && (
        <p className="rounded-element border p-4 text-13 text-muted-foreground">
          No audit artifact found. Generate one with{' '}
          <code className="font-mono">node scripts/design-audit.mjs</code> and commit
          public/design-audit.json.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">WCAG contrast (draft values)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Ratio</TableHead>
                  <TableHead>Verdict</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contrastRows.map(({ pair, mode, verdict }) => (
                  <TableRow key={`${pair.label}-${mode}`}>
                    <TableCell className="text-13">{pair.label}</TableCell>
                    <TableCell className="text-13">{mode}</TableCell>
                    <TableCell className="font-mono text-13">
                      {verdict ? `${verdict.ratio}:1` : '—'}
                    </TableCell>
                    <TableCell>
                      {verdict ? (
                        verdict.aa ? (
                          <Badge variant="outline">{verdict.aaa ? 'AAA' : 'AA'}</Badge>
                        ) : verdict.aaLarge ? (
                          <Badge variant="outline">AA large only</Badge>
                        ) : (
                          <Badge variant="destructive">FAIL</Badge>
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {data && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-title">Token usage in code</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Token</TableHead>
                          <TableHead className="text-right">References</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.usage.map((u) => (
                          <TableRow key={u.token}>
                            <TableCell className="font-mono text-13">--{u.token}</TableCell>
                            <TableCell className="text-right text-13">
                              {u.count === 0 ? <Badge variant="outline">unused</Badge> : u.count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-2 text-2xs text-muted-foreground">
                    Generated {generatedAt?.toLocaleString()} · var(--token) + semantic utility
                    references in src/.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-title">Documentation drift</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-13">
                  <p>
                    <span className="font-medium">{data.docs.missing_from_docs.length}</span> tokens
                    missing from docs/design-system/README.md
                  </p>
                  {data.docs.stale_in_docs.length > 0 && (
                    <p className="text-muted-foreground">
                      Stale in docs: {data.docs.stale_in_docs.map((t) => `--${t}`).join(', ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
