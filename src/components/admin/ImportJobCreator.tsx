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
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';
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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
  const { toast } = useToast();

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
    supabase
      .from('cities')
      .select('name, countries!inner(name)')
      .order('name')
      .then(({ data }) => {
        if (data)
          setAllCities(
            data.map((c: any) => ({ name: c.name, country: (c.countries as any)?.name || '' })),
          );
      });
  }, []);

  const selected = findImportItem(importType);

  /* ── CSV/API handlers ── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file',
        description: 'Please select a CSV file',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Too large', description: 'Max 50 MB', variant: 'destructive' });
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      setCsvData(text);
      const preview = parseCSVPreview(text, 5);
      setCsvPreview(preview);
      if (selected?.requiredFields) {
        const suggested = selected.requiredFields.filter((f) =>
          preview.headers.some((h) => h.toLowerCase().includes(f.toLowerCase())),
        );
        setUniqueKeyFields(suggested.slice(0, 2));
      }
    } catch {
      toast({ title: 'Read error', description: 'Failed to read CSV', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setImportType('');
    setCsvData('');
    setCsvPreview(null);
    setFileName('');
    setUniqueKeyFields([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!selected) {
      toast({ title: 'Select an import type', variant: 'destructive' });
      return;
    }

    if (selected.mode === 'venue-api') {
      setShowVenueImportDialog(true);
      return;
    }

    if (selected.mode === 'scraper') {
      try {
        let body: Record<string, any> = {};
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
        const { error } = await api.functions.invoke(importType, { body });
        if (error) throw error;
        toast({ title: 'Scraper started', description: desc });
        resetForm();
        return;
      } catch (err) {
        toast({
          title: 'Scraper failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
    }

    if (!csvData) {
      toast({ title: 'Upload a CSV file', variant: 'destructive' });
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

  const handleVenueImport = async (config: any) => {
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* ── CSV / Edge Function Imports ── */}
      <Card>
        <CardHeader sx={{ pb: 2 }}>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem' }}>
            <Upload style={{ height: 18, width: 18 }} />
            Import Data
          </CardTitle>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
              <SelectContent sx={{ maxHeight: 400 }}>
                {IMPORT_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
          </Box>

          {/* CSV mode */}
          {selected?.mode === 'csv' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    {fileName}
                  </Typography>
                )}
              </Box>

              {csvPreview && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: -1 }}>
                    <Eye style={{ height: 14, width: 14 }} />
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      Preview (first 5 rows)
                    </Typography>
                  </Box>
                  <Box
                    sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}
                  >
                    <Box
                      component="table"
                      sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}
                    >
                      <thead>
                        <Box component="tr" sx={{ bgcolor: 'action.hover' }}>
                          {csvPreview.headers.map((h, i) => (
                            <Box
                              component="th"
                              key={i}
                              sx={{
                                p: 0.75,
                                textAlign: 'left',
                                fontWeight: 600,
                                borderBottom: 1,
                                borderColor: 'divider',
                              }}
                            >
                              {h}
                            </Box>
                          ))}
                        </Box>
                      </thead>
                      <tbody>
                        {csvPreview.rows.map((row, i) => (
                          <tr key={i}>
                            {csvPreview.headers.map((h, j) => (
                              <Box
                                component="td"
                                key={j}
                                sx={{ p: 0.75, borderBottom: 1, borderColor: 'divider' }}
                              >
                                {row[h] || '-'}
                              </Box>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 200 }}>
                      <Label>Duplicates</Label>
                      <Select
                        value={duplicateStrategy}
                        onValueChange={(v) => setDuplicateStrategy(v as any)}
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
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        flex: 1,
                        minWidth: 200,
                      }}
                    >
                      <Label>Unique key fields</Label>
                      <Box
                        sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}
                      >
                        {uniqueKeyFields.map((f) => (
                          <Badge key={f} variant="secondary" sx={{ gap: 0.5 }}>
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
                          <SelectTrigger sx={{ width: 130, height: 28 }}>
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
                      </Box>
                    </Box>
                  </Box>
                </>
              )}
            </Box>
          )}

          {/* Events scraper config */}
          {importType === 'scrape-gaycities-events' && (
            <Card variant="outlined">
              <CardHeader sx={{ pb: 1 }}>
                <CardTitle
                  sx={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Sliders style={{ height: 14, width: 14 }} />
                  Events Scraper Config
                </CardTitle>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Label>Cities ({scraperCities.length})</Label>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {scraperCities.map((city) => (
                      <Badge key={city} variant="secondary" sx={{ gap: 0.5, fontSize: '0.75rem' }}>
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
                  </Box>
                  <Input
                    placeholder="Search cities..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    sx={{ maxWidth: 260 }}
                  />
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.5,
                      maxHeight: 150,
                      overflowY: 'auto',
                    }}
                  >
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
                            sx={{ fontSize: '0.7rem', height: 24 }}
                            onClick={() => setScraperCities((prev) => [...prev, slug])}
                          >
                            <Plus style={{ height: 10, width: 10, marginRight: 2 }} />
                            {city.name}{' '}
                            <span style={{ opacity: 0.5, marginLeft: 4 }}>{city.country}</span>
                          </Button>
                        );
                      })}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Label>Max cities:</Label>
                  <Select
                    value={scraperMaxCities.toString()}
                    onValueChange={(v) => setScraperMaxCities(parseInt(v))}
                  >
                    <SelectTrigger sx={{ width: 100 }}>
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
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Spartacus scraper config */}
          {importType === 'scrape-spartacus' && (
            <Card variant="outlined">
              <CardHeader sx={{ pb: 1 }}>
                <CardTitle
                  sx={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Sliders style={{ height: 14, width: 14 }} />
                  Spartacus Scraper Config
                </CardTitle>
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Label>Venue types</Label>
                  {[
                    { type: 'saunas', label: 'Saunas' },
                    { type: 'goingout', label: 'Bars & Clubs' },
                  ].map(({ type, label }) => (
                    <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                    </Box>
                  ))}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Label>Countries ({spartacusCountries.length})</Label>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {spartacusCountries.map((c) => (
                      <Badge key={c} variant="secondary" sx={{ gap: 0.5, fontSize: '0.75rem' }}>
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
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {['germany', 'spain', 'uk', 'france', 'netherlands', 'thailand', 'usa']
                      .filter((c) => !spartacusCountries.includes(c))
                      .map((c) => (
                        <Button
                          key={c}
                          variant="outline"
                          size="sm"
                          sx={{ fontSize: '0.7rem', height: 24 }}
                          onClick={() => setSpartacusCountries((prev) => [...prev, c])}
                        >
                          <Plus style={{ height: 10, width: 10, marginRight: 2 }} />
                          {c}
                        </Button>
                      ))}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Label>Max cities/country:</Label>
                    <Select
                      value={spartacusMaxCities.toString()}
                      onValueChange={(v) => setSpartacusMaxCities(parseInt(v))}
                    >
                      <SelectTrigger sx={{ width: 100 }}>
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
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Checkbox
                      id="discover"
                      checked={spartacusDiscover}
                      onCheckedChange={(v) => setSpartacusDiscover(!!v)}
                    />
                    <Label htmlFor="discover" style={{ fontSize: '0.85rem' }}>
                      Discover cities
                    </Label>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Submit */}
          {selected && (
            <Box sx={{ display: 'flex', pt: 1 }}>
              <Button onClick={handleSubmit} disabled={loading} sx={{ gap: 1 }}>
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
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Venue API dialog */}
      {showVenueImportDialog && selected?.mode === 'venue-api' && 'provider' in selected && (
        <VenueImportDialog
          open={showVenueImportDialog}
          onOpenChange={setShowVenueImportDialog}
          provider={(selected as any).provider}
          onImport={handleVenueImport}
          isImporting={loading}
        />
      )}
    </Box>
  );
};
