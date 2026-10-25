import { useEffect, useRef, useState } from 'react';
import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ContentTypeConfig } from '@/types/cms';
import { MAX_IMPORT_ROWS, readImportFile, type ImportSheet } from '@/lib/tableImport/files';
import {
  matchFields,
  suggestMapping,
  writableFields,
  type ImportMode,
  type ImportOptions,
} from '@/lib/tableImport/plan';
import {
  applyImport,
  previewImport,
  type ImportOutcome,
  type ImportPreview,
} from '@/lib/tableImport/service';
import { exportToCsv } from '@/utils/csvExport';

const modes: Array<[ImportMode, string]> = [
  ['create', 'Add new records only'],
  ['update', 'Correct existing records only'],
  ['upsert', 'Add new and correct existing records'],
  ['enrich', 'Enrich existing records — fill missing values'],
];
const display = (v: unknown) => (typeof v === 'string' ? v : (JSON.stringify(v) ?? 'empty'));

export function TableImportDialog({
  config,
  onComplete,
}: {
  config: ContentTypeConfig;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [options, setOptions] = useState<ImportOptions>({
    mode: 'create',
    matchField: config.primaryKey,
    clearBlanks: false,
    mapping: [],
  });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);
  const [busy, setBusy] = useState<'read' | 'preview' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [page, setPage] = useState(0);
  const [completed, setCompleted] = useState(new Set<number>());
  const [history, setHistory] = useState(new Map<number, ImportOutcome>());
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const sheet = sheets[sheetIndex];
  const fields = writableFields(config);
  const matches = matchFields(config);
  const mappedFields = [
    { name: config.primaryKey, label: 'Record ID (match or new ID)' },
    ...fields,
  ];
  const selected = preview?.rows.filter((r) => !excluded.has(r.row)) ?? [];
  const changeCount = selected.filter((r) => r.action === 'create' || r.action === 'update').length;
  const invalid = selected.some((r) => r.action === 'error');

  function reset() {
    setCompleted(new Set());
    setHistory(new Map());
    setSheets([]);
    setPreview(null);
    setOutcomes(null);
    setError('');
    setReviewed(false);
    setPage(0);
    setExcluded(new Set());
  }
  function updateOptions(change: Partial<ImportOptions>) {
    setOptions((prev) => ({ ...prev, ...change }));
    setPreview(null);
    setOutcomes(null);
    setReviewed(false);
  }
  async function upload(file: File) {
    reset();
    setBusy('read');
    try {
      const loaded = await readImportFile(file);
      setSheets(loaded);
      setSheetIndex(0);
      const mapping = suggestMapping(config, loaded[0].headers);
      const matchField = mapping.includes(config.primaryKey)
        ? config.primaryKey
        : (matches.find((f) => mapping.includes(f.name))?.name ?? config.primaryKey);
      setOptions((prev) => ({ ...prev, mapping, matchField }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally {
      setBusy(null);
    }
  }
  async function review() {
    if (!sheet) return;
    setBusy('preview');
    setError('');
    setReviewed(false);
    setOutcomes(null);
    try {
      setPreview(await previewImport(config, sheet, options));
      setExcluded(new Set(completed));
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the preview.');
    } finally {
      setBusy(null);
    }
  }
  async function apply() {
    if (!preview || !reviewed || invalid || !changeCount || outcomes) return;
    setBusy('apply');
    setError('');
    abort.current = new AbortController();
    try {
      await applyImport(config, preview, excluded, abort.current.signal, (results) => {
        setHistory(
          (previous) => new Map([...previous, ...results.map((r) => [r.row, r] as const)]),
        );
        setCompleted(
          (previous) =>
            new Set([
              ...previous,
              ...results
                .filter((r) => ['created', 'updated', 'failed'].includes(r.status))
                .map((r) => r.row),
            ]),
        );
        setOutcomes(results);
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Import stopped. Review the report before retrying.',
      );
    } finally {
      setBusy(null);
      onComplete();
    }
  }
  function report() {
    const rows =
      preview?.rows.map((r) => {
        const outcome = outcomes?.find((o) => o.row === r.row) ?? history.get(r.row);
        return {
          row: r.row,
          identity: r.identity,
          action: r.action,
          status: outcome?.status ?? (excluded.has(r.row) ? 'excluded' : 'not attempted'),
          message: outcome?.message ?? r.issues.join('; '),
          changes: JSON.stringify(r.patch),
          id: outcome?.id ?? '',
        };
      }) ?? [];
    exportToCsv(
      rows,
      (['row', 'identity', 'action', 'status', 'id', 'message', 'changes'] as const).map((key) => ({
        header: key,
        accessor: (r: (typeof rows)[number]) => r[key],
      })),
      `${config.tableName}-import-report.csv`,
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          if (!next) reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className="justify-start gap-2">
          <Upload size={16} />
          Import / upload
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import {config.label.plural}</DialogTitle>
          <DialogDescription>
            Upload, map columns, review changes, then apply. Matching includes every record,
            regardless of list filters or pagination.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!preview && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <label htmlFor={`import-file-${config.id}`} className="flex-1 space-y-2 text-sm">
                CSV, TSV or Excel file (10 MB, up to {MAX_IMPORT_ROWS.toLocaleString('en-US')} rows)
                <Input
                  type="file"
                  id={`import-file-${config.id}`}
                  accept=".csv,.tsv,.txt,.xlsx"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = '';
                  }}
                />
              </label>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  exportToCsv(
                    [],
                    [
                      { header: config.primaryKey, accessor: () => '' },
                      ...fields.map((f) => ({ header: f.name, accessor: () => '' })),
                    ],
                    `${config.tableName}-import-template.csv`,
                  )
                }
              >
                <Download size={16} className="mr-2" />
                Template
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Blank cells preserve values by default. Arrays accept JSON or values separated by |;
              structured fields require JSON. Use stored IDs for related records and format
              identifiers as text in Excel. Excel formulas must be replaced with values.
            </p>
            {sheets.length > 1 && (
              <label className="block text-sm">
                Worksheet
                <select
                  className="mt-2 block w-full rounded-element border bg-background p-2"
                  value={sheetIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSheetIndex(i);
                    updateOptions({ mapping: suggestMapping(config, sheets[i].headers) });
                  }}
                  disabled={!!busy}
                >
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} ({s.rows.length} rows)
                    </option>
                  ))}
                </select>
              </label>
            )}
            {sheet && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Import mode
                    <select
                      className="mt-2 block w-full rounded-element border bg-background p-2"
                      value={options.mode}
                      onChange={(e) =>
                        updateOptions({ mode: e.target.value as ImportMode, clearBlanks: false })
                      }
                      disabled={!!busy}
                    >
                      {modes.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Match existing records exactly by
                    <select
                      className="mt-2 block w-full rounded-element border bg-background p-2"
                      value={options.matchField}
                      onChange={(e) => updateOptions({ matchField: e.target.value })}
                      disabled={!!busy}
                    >
                      {matches.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.label} ({f.name})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="mb-2 text-left">
                      Map {sheet.headers.length} columns · {sheet.rows.length} rows
                    </caption>
                    <thead>
                      <tr>
                        <th className="p-2">File column</th>
                        <th className="p-2">Example</th>
                        <th className="p-2">Destination field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.headers.map((h, col) => (
                        <tr key={h} className="border-t">
                          <th className="p-2 font-medium">{h}</th>
                          <td className="max-w-52 truncate p-2" title={sheet.rows[0][col]}>
                            {sheet.rows[0][col]}
                          </td>
                          <td className="p-2">
                            <select
                              aria-label={`Map ${h}`}
                              className="w-full rounded-element border bg-background p-2"
                              disabled={!!busy}
                              value={options.mapping[col] ?? ''}
                              onChange={(e) => {
                                const mapping = [...options.mapping];
                                mapping[col] = e.target.value;
                                updateOptions({ mapping });
                              }}
                            >
                              <option value="">Skip column</option>
                              {mappedFields.map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.label} ({f.name})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {['update', 'upsert'].includes(options.mode) && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={options.clearBlanks}
                      disabled={!!busy}
                      onChange={(e) => updateOptions({ clearBlanks: e.target.checked })}
                    />
                    Clear mapped values when the uploaded cell is blank
                  </label>
                )}
                <Button onClick={() => void review()} disabled={!!busy}>
                  {busy === 'preview' ? 'Preparing preview…' : 'Preview changes'}
                </Button>
              </>
            )}
          </div>
        )}
        {preview && (
          <div className="space-y-4">
            <p role="status" className="text-sm">
              {(['create', 'update', 'skip', 'error'] as const)
                .map((a) => `${preview.rows.filter((r) => r.action === a).length} ${a}`)
                .join(' · ')}
              {outcomes
                ? ` · ${outcomes.filter((o) => ['created', 'updated'].includes(o.status)).length} saved · ${outcomes.filter((o) => o.status === 'failed').length} failed · ${outcomes.filter((o) => o.status === 'cancelled').length} not attempted`
                : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!!busy || !!outcomes}
                onClick={() => {
                  setPreview(null);
                  setReviewed(false);
                }}
              >
                Back to mapping
              </Button>
              <Button
                variant="outline"
                disabled={!!busy || !!outcomes}
                onClick={() => {
                  setExcluded(
                    new Set([
                      ...completed,
                      ...preview.rows.filter((r) => r.action === 'error').map((r) => r.row),
                    ]),
                  );
                  setReviewed(false);
                }}
              >
                Exclude invalid rows
              </Button>
              <Button variant="outline" onClick={report}>
                <Download size={16} className="mr-2" />
                Download report
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Import changes and results</caption>
                <thead>
                  <tr>
                    <th className="p-2">Include</th>
                    <th className="p-2">Row / match</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Changes and issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(page * 50, page * 50 + 50).map((r) => {
                    const outcome = outcomes?.find((o) => o.row === r.row) ?? history.get(r.row);
                    return (
                      <tr key={r.row} className="border-t align-top">
                        <td className="p-2">
                          <input
                            aria-label={`Include row ${r.row}`}
                            type="checkbox"
                            disabled={!!busy || !!outcomes || completed.has(r.row)}
                            checked={!excluded.has(r.row)}
                            onChange={(e) => {
                              const next = new Set(excluded);
                              if (e.target.checked) next.delete(r.row);
                              else next.add(r.row);
                              setExcluded(next);
                              setReviewed(false);
                            }}
                          />
                        </td>
                        <th className="max-w-48 break-words p-2 font-medium">
                          {r.row}: {r.identity || 'New record'}
                        </th>
                        <td className="p-2">{outcome?.status ?? r.action}</td>
                        <td className="max-w-md break-words p-2">
                          {r.issues.map((issue) => (
                            <p
                              key={issue}
                              className={r.action === 'error' ? 'text-destructive' : ''}
                            >
                              {issue}
                            </p>
                          ))}
                          {Object.keys(r.patch).length > 0 && (
                            <details>
                              <summary>
                                {Object.keys(r.patch).length} field{' '}
                                {Object.keys(r.patch).length === 1 ? 'change' : 'changes'}
                              </summary>
                              <dl>
                                {Object.entries(r.patch).map(([key, value]) => (
                                  <div key={key} className="mt-2">
                                    <dt className="font-medium">
                                      {fields.find((field) => field.name === key)?.label ?? key}
                                    </dt>
                                    <dd>
                                      {r.before ? `${display(r.before[key])} → ` : ''}
                                      {display(value)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          )}
                          {outcome && <p>{outcome.message}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 50 && (
              <div className="flex items-center gap-4">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous preview page
                </Button>
                <span className="text-sm">
                  Page {page + 1} of {Math.ceil(preview.rows.length / 50)}
                </span>
                <Button
                  variant="outline"
                  disabled={(page + 1) * 50 >= preview.rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next preview page
                </Button>
              </div>
            )}
            {!outcomes && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={!!busy}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed the {changeCount} proposed record changes. Rows save individually; an
                import can partially succeed.
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!!busy || !!outcomes || !reviewed || invalid || !changeCount}
                onClick={() => void apply()}
              >
                {busy === 'apply'
                  ? 'Applying changes…'
                  : `Apply ${changeCount} record ${changeCount === 1 ? 'change' : 'changes'}`}
              </Button>
              {busy === 'apply' && (
                <Button variant="outline" onClick={() => abort.current?.abort()}>
                  Stop after current row
                </Button>
              )}
              {outcomes && !busy && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setOutcomes(null);
                    setReviewed(false);
                  }}
                >
                  Prepare a fresh preview
                </Button>
              )}
            </div>
            {outcomes && (
              <p className="text-sm text-muted-foreground">
                Successful rows have already been saved. Check failed or unattempted rows in the
                report before preparing another import. Creation is never automatically retried.
              </p>
            )}
          </div>
        )}
        {busy === 'read' && <p role="status">Reading file…</p>}
      </DialogContent>
    </Dialog>
  );
}
