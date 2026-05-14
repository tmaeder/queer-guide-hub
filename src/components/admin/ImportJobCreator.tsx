import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useImportHub } from '@/hooks/useImportHub';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { listFrom } from '@/hooks/usePageFetchers';
import {
  Upload,
  Eye,
  X,
  Plus,
  RefreshCw,
  MapPin,
  Calendar,
  Users,
  Tag,
  CheckCircle,
  Sliders,
} from 'lucide-react';
import { VenueImportDialog } from './venues/VenueImportDialog';
import {
  classifyEntityType,
  expectedEntityTypeFor,
  summarizeDetections,
  type ClassifyResult,
  type DetectionSummary,
  type EntityType,
} from '@/lib/entityTypeClassifier';

/* ── Import types for CSV/API flows ── */
const IMPORT_GROUPS = [
  {
    label: 'Venues',
    icon: MapPin,
    items: [
      {
        key: 'venues-csv',
        label: 'CSV Upload',
        mode: 'csv' as const,
        requiredFields: ['name', 'address', 'city', 'country'],
      },
      {
        key: 'venues-foursquare',
        label: 'Foursquare API',
        mode: 'venue-api' as const,
        provider: 'foursquare' as const,
      },
      { key: 'scrape-spartacus', label: 'Spartacus Scraper', mode: 'scraper' as const },
    ],
  },
  {
    label: 'Events',
    icon: Calendar,
    items: [
      {
        key: 'events-csv',
        label: 'CSV Upload',
        mode: 'csv' as const,
        requiredFields: ['title', 'start_date', 'venue_name', 'city', 'country'],
      },
      { key: 'scrape-gaycities-events', label: 'GayTravel4u Scraper', mode: 'scraper' as const },
    ],
  },
  {
    label: 'Personalities',
    icon: Users,
    items: [
      {
        key: 'personalities-csv',
        label: 'CSV Upload',
        mode: 'csv' as const,
        requiredFields: ['name'],
      },
    ],
  },
  {
    label: 'Tags',
    icon: Tag,
    items: [
      {
        key: 'tags-csv',
        label: 'CSV Upload',
        mode: 'csv' as const,
        requiredFields: ['name', 'category'],
      },
    ],
  },
];

type ImportItem = (typeof IMPORT_GROUPS)[number]['items'][number];
function findImportItem(key: string): ImportItem | null {
  for (const g of IMPORT_GROUPS) {
    const found = g.items.find((i) => i.key === key);
    if (found) return found;
  }
  return null;
}

export const ImportJobCreator = () => {
  const { createImportJob, parseCSVPreview, loading } = useImportHub();

  const [importType, setImportType] = useState('');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'overwrite' | 'create_new'>(
    'skip',
  );
  const [uniqueKeyFields, setUniqueKeyFields] = useState<string[]>([]);
  const [csvData, setCsvData] = useState('');
  const [csvPreview, setCsvPreview] = useState<{
    headers: string[];
    rows: Record<string, string>[];
  } | null>(null);
  const [previewClassifications, setPreviewClassifications] = useState<ClassifyResult[]>([]);
  const [detectionSummary, setDetectionSummary] = useState<DetectionSummary | null>(null);
  const [routingAcknowledged, setRoutingAcknowledged] = useState(false);
  const [fileName, setFileName] = useState('');
  const [showVenueImportDialog, setShowVenueImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edge function scraper state
  const [scraperCities, setScraperCities] = useState<string[]>([
    'berlin',
    'amsterdam',
    'barcelona',
    'london',
    'paris',
    'new-york',
    'san-francisco',
    'los-angeles',
    'miami',
    'chicago',
  ]);
  const [scraperMaxCities, setScraperMaxCities] = useState(10);
  const [spartacusTypes, setSpartacusTypes] = useState<string[]>(['saunas', 'goingout']);
  const [spartacusCountries, setSpartacusCountries] = useState<string[]>([
    'germany',
    'spain',
    'uk',
    'usa',
  ]);
  const [spartacusMaxCities, setSpartacusMaxCities] = useState(5);
  const [spartacusDiscover, setSpartacusDiscover] = useState(false);

  // City picker
  const [allCities, setAllCities] = useState<{ name: string; country: string }[]>([]);
  const [citySearch, setCitySearch] = useState('');

  useEffect(() => {
    listFrom<{ name: string; countries?: { name?: string } }>(
      'cities',
      'name, countries!inner(name)',
      { col: 'name' },
    ).then((data) => {
      setAllCities(data.map((c) => ({ name: c.name, country: c.countries?.name || '' })));
    });
  }, []);

  const selected = findImportItem(importType);
  const expectedType: EntityType | null = expectedEntityTypeFor(importType);

  /* ── CSV/API handlers ── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast.error('Invalid file: Please select a CSV file');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Too large: Max 50 MB');
      return;
    }
    setFileName(file.name);
    setRoutingAcknowledged(false);
    try {
      const text = await file.text();
      setCsvData(text);
      const preview = parseCSVPreview(text, 5);
      setCsvPreview(preview);
      setPreviewClassifications(preview.rows.map((row) => classifyEntityType(row)));
      // Full-file detection (capped at ~5000 rows for performance — same
      // shape as parseCSVPreview but unbounded). The classifier is pure JS,
      // a 5000-row scan with simple regex takes <100ms.
      const fullPreview = parseCSVPreview(text, 5000);
      setDetectionSummary(summarizeDetections(fullPreview.rows, expectedEntityTypeFor(importType)));
      if (selected?.requiredFields) {
        const suggested = selected.requiredFields.filter((f) =>
          preview.headers.some((h) => h.toLowerCase().includes(f.toLowerCase())),
        );
        setUniqueKeyFields(suggested.slice(0, 2));
      }
    } catch {
      toast.error('Read error: Failed to read CSV');
    }
  };

  const resetForm = () => {
    setImportType('');
    setCsvData('');
    setCsvPreview(null);
    setPreviewClassifications([]);
    setDetectionSummary(null);
    setRoutingAcknowledged(false);
    setFileName('');
    setUniqueKeyFields([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!selected) {
      toast.error('Select an import type');
      return;
    }

    if (selected.mode === 'venue-api') {
      setShowVenueImportDialog(true);
      return;
    }

    if (selected.mode === 'scraper') {
      try {
        let body: Record<string, unknown> = {};
        let desc = '';
        if (importType === 'scrape-gaycities-events') {
          const cityInfoMap: Record<string, { displayName: string; country: string }> = {};
          for (const slug of scraperCities) {
            const match = allCities.find((c) => c.name.toLowerCase().replace(/\s+/g, '-') === slug);
            if (match) cityInfoMap[slug] = { displayName: match.name, country: match.country };
          }
          body = { cities: scraperCities, max_cities: scraperMaxCities, city_info: cityInfoMap };
          desc = `Event scraper: ${scraperCities.length} cities`;
        } else if (importType === 'scrape-spartacus') {
          body = {
            venue_types: spartacusTypes,
            countries: spartacusCountries,
            max_cities_per_country: spartacusMaxCities,
            discover_cities: spartacusDiscover,
          };
          desc = `Spartacus scraper: ${spartacusCountries.length} countries`;
        }
        const { error } = await supabase.functions.invoke(importType, { body });
        if (error) throw error;
        toast.success(`Scraper started: ${desc}`);
        resetForm();
        return;
      } catch (err) {
        toast.error(`Scraper failed: ${err}`);
        return;
      }
    }

    if (!csvData) {
      toast.error('Upload a CSV file');
      return;
    }

    // Issue #113 guard: block submit when the CSV contains rows the
    // classifier thinks belong elsewhere, until the user has explicitly
    // acknowledged the routing. The legacy import-*-csv handlers stamp
    // the whole batch with one target_table, so mismatches today silently
    // ingest as the wrong entity type.
    if (
      detectionSummary &&
      detectionSummary.mismatches > 0 &&
      !routingAcknowledged
    ) {
      toast({
        title: 'Mixed entity types detected',
        description: `${detectionSummary.mismatches} row(s) look like a different entity type. Review the preview and check the acknowledgement box to continue.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await createImportJob(importType, 'csv', {
        duplicateStrategy,
        uniqueKeyFields,
        validationRules: {},
        filters: {},
        sourceData: csvData,
        fileName,
        fileSize: new Blob([csvData]).size,
      });
      resetForm();
    } catch {
      // handled by hook
    }
  };

  const handleVenueImport = async (config: Record<string, unknown>) => {
    try {
      await createImportJob(importType, 'api', {
        duplicateStrategy,
        uniqueKeyFields,
        validationRules: {},
        filters: {},
        venueImportConfig: config,
      });
      resetForm();
      setShowVenueImportDialog(false);
    } catch {
      // handled by hook
    }
  };

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-5">
      {/* ── CSV / Edge Function Imports ── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Upload style={{ height: 18, width: 18 }} />
            Import Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label>What to import</Label>
            <Select
              value={importType}
              onValueChange={(v) => {
                setImportType(v);
                setCsvPreview(null);
                setCsvData('');
                setFileName('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select import type..." />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>
                      <group.icon style={{ height: 14, width: 14 }} />
                      {group.label}
                    </SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CSV mode */}
          {selected?.mode === 'csv' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="csv-file">CSV File (max 50 MB)</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                {fileName && (
                  <p className="text-xs text-muted-foreground">
                    {fileName}
                  </p>
                )}
              </div>

              {csvPreview && (
                <>
                  <div className="flex items-center gap-2 -mb-2">
                    <Eye style={{ height: 14, width: 14 }} />
                    <p className="text-sm font-medium">
                      Preview (first 5 rows)
                    </p>
                  </div>
                  {detectionSummary && (
                    <div className={`flex flex-col gap-1.5 p-2 border rounded ${detectionSummary.mismatches > 0 ? "border-destructive bg-destructive/10" : "border-border bg-muted"}`}>
                      <p className="text-xs font-semibold">
                        Detected entity types ({detectionSummary.rows.length} rows scanned)
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(['personality', 'venue', 'event', 'tag', 'unknown'] as const)
                          .filter((t) => detectionSummary.byType[t] > 0)
                          .map((t) => {
                            const count = detectionSummary.byType[t];
                            const isMismatch =
                              expectedType !== null && t !== 'unknown' && t !== expectedType;
                            return (
                              <Badge
                                key={t}
                                variant={isMismatch ? 'destructive' : 'secondary'}
                              >
                                {t}: {count}
                              </Badge>
                            );
                          })}
                      </div>
                      {detectionSummary.mismatches > 0 && expectedType && (
                        <p className="text-xs text-destructive">
                          {detectionSummary.mismatches} row(s) don&apos;t look like{' '}
                          <b>{expectedType}</b>. They will still be staged as{' '}
                          <b>{expectedType}</b> by this import; the AI validator may reject
                          them. To route per-row to the correct table, use the pipeline DAG
                          with the <code>source-csv-upload</code> node instead.
                        </p>
                      )}
                      {detectionSummary.unknownCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {detectionSummary.unknownCount} row(s) couldn&apos;t be auto-classified
                          and will fall back to <b>{expectedType ?? 'job-level type'}</b>.
                        </p>
                      )}
                      {detectionSummary.mismatches > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox
                            id="ack-routing"
                            checked={routingAcknowledged}
                            onCheckedChange={(v) => setRoutingAcknowledged(!!v)}
                          />
                          <Label htmlFor="ack-routing" style={{ fontSize: '0.75rem' }}>
                            I understand mixed-type rows will be staged as{' '}
                            {expectedType ?? 'the selected type'}.
                          </Label>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="overflow-x-auto border border-border rounded">
                    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr className="bg-muted">
                          <th className="p-1.5 text-left font-semibold border-b border-border whitespace-nowrap">
                            detected
                          </th>
                          {csvPreview.headers.map((h, i) => (
                            <th key={i} className="p-1.5 text-left font-semibold border-b border-border">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.rows.map((row, i) => {
                          const detected = previewClassifications[i];
                          const detectedType = detected?.entityType ?? 'unknown';
                          const isMismatch =
                            !!expectedType &&
                            detectedType !== 'unknown' &&
                            detectedType !== expectedType;
                          return (
                            <tr key={i}>
                              <td className="p-1.5 border-b border-border whitespace-nowrap" title={detected?.reason}>
                                <Badge variant={isMismatch ? 'destructive' : 'secondary'}>
                                  {detectedType}
                                </Badge>
                              </td>
                              {csvPreview.headers.map((h, j) => (
                                <td key={j} className="p-1.5 border-b border-border">
                                  {row[h] || '-'}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-4 flex-wrap">
                    <div className="flex flex-col gap-1" style={{ minWidth: 200 }}>
                      <Label>Duplicates</Label>
                      <Select
                        value={duplicateStrategy}
                        onValueChange={(v) => setDuplicateStrategy(v as 'skip' | 'update' | 'create')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Skip</SelectItem>
                          <SelectItem value="overwrite">Overwrite</SelectItem>
                          <SelectItem value="create_new">Create new</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 200 }}>
                      <Label>Unique key fields</Label>
                      <div className="flex flex-wrap gap-1 items-center">
                        {uniqueKeyFields.map((f) => (
                          <Badge key={f} variant="secondary">
                            {f}
                            <button
                              onClick={() =>
                                setUniqueKeyFields((prev) => prev.filter((x) => x !== f))
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              <X style={{ height: 10, width: 10 }} />
                            </button>
                          </Badge>
                        ))}
                        <Select
                          onValueChange={(v) => {
                            if (!uniqueKeyFields.includes(v))
                              setUniqueKeyFields((prev) => [...prev, v]);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="+ Add" />
                          </SelectTrigger>
                          <SelectContent>
                            {csvPreview.headers
                              .filter((h) => !uniqueKeyFields.includes(h))
                              .map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Events scraper config */}
          {importType === 'scrape-gaycities-events' && (
            <Card variant="outlined">
              <CardHeader>
                <CardTitle

                >
                  <Sliders style={{ height: 14, width: 14 }} />
                  Events Scraper Config
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  <Label>Cities ({scraperCities.length})</Label>
                  <div className="flex flex-wrap gap-1">
                    {scraperCities.map((city) => (
                      <Badge key={city} variant="secondary">
                        {city}
                        <button
                          onClick={() => setScraperCities((prev) => prev.filter((c) => c !== city))}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <X style={{ height: 10, width: 10 }} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Search cities..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}

                  />
                  <div className="flex flex-wrap gap-1 overflow-y-auto" style={{ maxHeight: 150 }}>
                    {allCities
                      .filter((c) => {
                        const slug = c.name.toLowerCase().replace(/\s+/g, '-');
                        return (
                          !scraperCities.includes(slug) &&
                          (citySearch === '' ||
                            c.name.toLowerCase().includes(citySearch.toLowerCase()) ||
                            c.country.toLowerCase().includes(citySearch.toLowerCase()))
                        );
                      })
                      .slice(0, citySearch ? 50 : 20)
                      .map((city) => {
                        const slug = city.name.toLowerCase().replace(/\s+/g, '-');
                        return (
                          <Button
                            key={slug}
                            variant="outline"
                            size="sm"

                            onClick={() => setScraperCities((prev) => [...prev, slug])}
                          >
                            <Plus style={{ height: 10, width: 10, marginRight: 2 }} />
                            {city.name}{' '}
                            <span style={{ opacity: 0.5, marginLeft: 4 }}>{city.country}</span>
                          </Button>
                        );
                      })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Max cities:</Label>
                  <Select
                    value={scraperMaxCities.toString()}
                    onValueChange={(v) => setScraperMaxCities(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 15, 20].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Spartacus scraper config */}
          {importType === 'scrape-spartacus' && (
            <Card variant="outlined">
              <CardHeader>
                <CardTitle

                >
                  <Sliders style={{ height: 14, width: 14 }} />
                  Spartacus Scraper Config
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  <Label>Venue types</Label>
                  {[
                    { type: 'saunas', label: 'Saunas' },
                    { type: 'goingout', label: 'Bars & Clubs' },
                  ].map(({ type, label }) => (
                    <div key={type} className="flex items-center gap-2">
                      <Checkbox
                        id={`vt-${type}`}
                        checked={spartacusTypes.includes(type)}
                        onCheckedChange={(checked) =>
                          setSpartacusTypes((prev) =>
                            checked ? [...prev, type] : prev.filter((t) => t !== type),
                          )
                        }
                      />
                      <Label htmlFor={`vt-${type}`}>{label}</Label>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Countries ({spartacusCountries.length})</Label>
                  <div className="flex flex-wrap gap-1">
                    {spartacusCountries.map((c) => (
                      <Badge key={c} variant="secondary">
                        {c}
                        <button
                          onClick={() =>
                            setSpartacusCountries((prev) => prev.filter((x) => x !== c))
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <X style={{ height: 10, width: 10 }} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['germany', 'spain', 'uk', 'france', 'netherlands', 'thailand', 'usa']
                      .filter((c) => !spartacusCountries.includes(c))
                      .map((c) => (
                        <Button
                          key={c}
                          variant="outline"
                          size="sm"

                          onClick={() => setSpartacusCountries((prev) => [...prev, c])}
                        >
                          <Plus style={{ height: 10, width: 10, marginRight: 2 }} />
                          {c}
                        </Button>
                      ))}
                  </div>
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label>Max cities/country:</Label>
                    <Select
                      value={spartacusMaxCities.toString()}
                      onValueChange={(v) => setSpartacusMaxCities(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[3, 5, 10, 20].map((n) => (
                          <SelectItem key={n} value={n.toString()}>
                            {n === 20 ? 'All' : String(n)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="discover"
                      checked={spartacusDiscover}
                      onCheckedChange={(v) => setSpartacusDiscover(!!v)}
                    />
                    <Label htmlFor="discover" style={{ fontSize: '0.85rem' }}>
                      Discover cities
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit */}
          {selected && (
            <div className="flex pt-2">
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw
                      style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }}
                    />{' '}
                    Running...
                  </>
                ) : (
                  <>
                    <CheckCircle style={{ height: 16, width: 16 }} />{' '}
                    {selected.mode === 'venue-api' ? 'Configure Import' : 'Start Import'}
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Venue API dialog */}
      {showVenueImportDialog && selected?.mode === 'venue-api' && 'provider' in selected && (
        <VenueImportDialog
          open={showVenueImportDialog}
          onOpenChange={setShowVenueImportDialog}
          provider={(selected as Record<string, unknown>).provider as string}
          onImport={handleVenueImport}
          isImporting={loading}
        />
      )}
    </div>
  );
};
