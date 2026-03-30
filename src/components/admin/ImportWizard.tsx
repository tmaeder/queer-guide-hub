/**
 * ImportWizard — 3-step import wizard replacing 7 import pages.
 * Step 1: Configure (source, content type, options)
 * Step 2: Monitor (progress, validation results)
 * Step 3: Review (staging items, bulk approve)
 */

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import TextField from '@mui/material/TextField';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { alpha } from '@mui/material/styles';
import {
  Upload,
  Database,
  Globe,
  FileSpreadsheet,
  Rss,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Types ───────────────────────────────────────────────────────────

interface ImportSource {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  sourceType: 'csv' | 'api' | 'scraping';
  contentTypes: string[];
}

interface ImportConfig {
  source: string;
  contentType: string;
  duplicateStrategy: 'skip' | 'overwrite' | 'create_new';
  options: Record<string, string>;
}

const IMPORT_SOURCES: ImportSource[] = [
  {
    id: 'csv',
    label: 'CSV Upload',
    icon: FileSpreadsheet,
    description: 'Upload a CSV file with data',
    sourceType: 'csv',
    contentTypes: ['venues', 'events', 'personalities', 'cities', 'countries', 'hotels'],
  },
  {
    id: 'foursquare',
    label: 'Foursquare',
    icon: Globe,
    description: 'Import venues from Foursquare API',
    sourceType: 'api',
    contentTypes: ['venues'],
  },
  {
    id: 'google-places',
    label: 'Google Places',
    icon: Globe,
    description: 'Import venues from Google Places',
    sourceType: 'api',
    contentTypes: ['venues'],
  },
  {
    id: 'tripadvisor',
    label: 'TripAdvisor',
    icon: Globe,
    description: 'Import venues from TripAdvisor',
    sourceType: 'api',
    contentTypes: ['venues'],
  },
  {
    id: 'tomtom',
    label: 'TomTom',
    icon: Globe,
    description: 'Import venues from TomTom Places',
    sourceType: 'api',
    contentTypes: ['venues'],
  },
  {
    id: 'eventbrite',
    label: 'Eventbrite',
    icon: Globe,
    description: 'Import events from Eventbrite',
    sourceType: 'api',
    contentTypes: ['events'],
  },
  {
    id: 'ticketmaster',
    label: 'Ticketmaster',
    icon: Globe,
    description: 'Import events from Ticketmaster',
    sourceType: 'api',
    contentTypes: ['events'],
  },
  {
    id: 'rss',
    label: 'RSS Feed',
    icon: Rss,
    description: 'Import articles from RSS feeds',
    sourceType: 'scraping',
    contentTypes: ['news_articles'],
  },
];

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venues',
  events: 'Events',
  personalities: 'Personalities',
  news_articles: 'News Articles',
  cities: 'Cities',
  countries: 'Countries',
  hotels: 'Hotels',
};

const steps = ['Configure', 'Import', 'Review'];

// ── Step 1: Configure ───────────────────────────────────────────────

function ConfigureStep({
  config,
  setConfig,
}: {
  config: ImportConfig;
  setConfig: (c: ImportConfig) => void;
}) {
  const selectedSource = IMPORT_SOURCES.find((s) => s.id === config.source);
  const availableContentTypes = selectedSource?.contentTypes ?? Object.keys(CONTENT_TYPE_LABELS);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Source selection */}
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
          Import Source
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {IMPORT_SOURCES.map((source) => {
            const isSelected = config.source === source.id;
            return (
              <Paper
                key={source.id}
                variant="outlined"
                onClick={() =>
                  setConfig({ ...config, source: source.id, contentType: source.contentTypes[0] })
                }
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  textAlign: 'center',
                  borderColor: isSelected ? '#8b5cf6' : 'divider',
                  borderWidth: isSelected ? 2 : 1,
                  bgcolor: isSelected ? alpha('#8b5cf6', 0.04) : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: '#8b5cf6' },
                }}
              >
                <source.icon
                  size={24}
                  style={{ color: isSelected ? '#8b5cf6' : '#9ca3af', marginBottom: 4 }}
                />
                <Typography
                  variant="body2"
                  sx={{ fontWeight: isSelected ? 600 : 500, fontSize: '0.8rem' }}
                >
                  {source.label}
                </Typography>
                <Chip
                  label={source.sourceType}
                  size="small"
                  sx={{ mt: 0.5, height: 18, fontSize: '0.6rem', fontWeight: 600 }}
                />
              </Paper>
            );
          })}
        </Box>
      </Box>

      {/* Content type */}
      <FormControl size="small" sx={{ maxWidth: 300 }}>
        <InputLabel>Content Type</InputLabel>
        <Select
          value={config.contentType}
          label="Content Type"
          onChange={(e) => setConfig({ ...config, contentType: e.target.value })}
        >
          {availableContentTypes.map((ct) => (
            <MenuItem key={ct} value={ct}>
              {CONTENT_TYPE_LABELS[ct] ?? ct}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Duplicate strategy */}
      <FormControl size="small" sx={{ maxWidth: 300 }}>
        <InputLabel>Duplicate Handling</InputLabel>
        <Select
          value={config.duplicateStrategy}
          label="Duplicate Handling"
          onChange={(e) =>
            setConfig({
              ...config,
              duplicateStrategy: e.target.value as ImportConfig['duplicateStrategy'],
            })
          }
        >
          <MenuItem value="skip">Skip duplicates</MenuItem>
          <MenuItem value="overwrite">Overwrite existing</MenuItem>
          <MenuItem value="create_new">Create as new</MenuItem>
        </Select>
      </FormControl>

      {/* API-specific options */}
      {selectedSource?.sourceType === 'api' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            size="small"
            label="Search Query"
            value={config.options.query ?? ''}
            onChange={(e) =>
              setConfig({ ...config, options: { ...config.options, query: e.target.value } })
            }
            placeholder="e.g. 'LGBTQ bars Berlin'"
            sx={{ maxWidth: 400 }}
          />
          <TextField
            size="small"
            label="Location / City"
            value={config.options.location ?? ''}
            onChange={(e) =>
              setConfig({ ...config, options: { ...config.options, location: e.target.value } })
            }
            placeholder="e.g. 'Berlin, Germany'"
            sx={{ maxWidth: 400 }}
          />
          <TextField
            size="small"
            label="Max Results"
            type="number"
            value={config.options.limit ?? '50'}
            onChange={(e) =>
              setConfig({ ...config, options: { ...config.options, limit: e.target.value } })
            }
            sx={{ maxWidth: 200 }}
          />
        </Box>
      )}
    </Box>
  );
}

// ── Step 2: Import Progress ─────────────────────────────────────────

function ImportStep({
  jobId,
  progress,
  status,
  stats,
}: {
  jobId: string | null;
  progress: number;
  status: string;
  stats: { total: number; valid: number; invalid: number; duplicates: number };
}) {
  const isRunning = ['processing', 'validating', 'pending'].includes(status);
  const isDone = status === 'completed';
  const isFailed = status === 'failed';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 4 }}>
      {isRunning && (
        <>
          <Loader2 size={48} style={{ color: '#8b5cf6', animation: 'spin 1s linear infinite' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Importing...
          </Typography>
        </>
      )}
      {isDone && (
        <>
          <CheckCircle2 size={48} style={{ color: '#10b981' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#10b981' }}>
            Import Complete
          </Typography>
        </>
      )}
      {isFailed && (
        <>
          <AlertCircle size={48} style={{ color: '#ef4444' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#ef4444' }}>
            Import Failed
          </Typography>
        </>
      )}

      <Box sx={{ width: '100%', maxWidth: 500 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: alpha('#8b5cf6', 0.12),
            '& .MuiLinearProgress-bar': {
              bgcolor: isFailed ? '#ef4444' : isDone ? '#10b981' : '#8b5cf6',
              borderRadius: 4,
            },
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}
        >
          {Math.round(progress)}% — {status}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 2,
          width: '100%',
          maxWidth: 500,
        }}
      >
        <StatBox label="Total" value={stats.total} color="#64748b" />
        <StatBox label="Valid" value={stats.valid} color="#10b981" />
        <StatBox label="Invalid" value={stats.invalid} color="#ef4444" />
        <StatBox label="Duplicates" value={stats.duplicates} color="#f59e0b" />
      </Box>
    </Box>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1.5, bgcolor: alpha(color, 0.06) }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color, lineHeight: 1 }}>
        {value.toLocaleString()}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  );
}

// ── Step 3: Review ──────────────────────────────────────────────────

function ReviewStep({ jobId }: { jobId: string | null }) {
  return (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CheckCircle2 size={48} style={{ color: '#10b981', marginBottom: 16 }} />
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        Import completed — items are now in the staging queue
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Review and approve imported items in the Review Queue.
      </Typography>
      <Button
        variant="contained"
        href="/admin/review?tab=staging"
        startIcon={<ArrowRight size={16} />}
        sx={{ textTransform: 'none' }}
      >
        Go to Review Queue
      </Button>
    </Box>
  );
}

// ── Main Wizard ─────────────────────────────────────────────────────

export function ImportWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const [config, setConfig] = useState<ImportConfig>({
    source: 'csv',
    contentType: 'venues',
    duplicateStrategy: 'skip',
    options: {},
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');
  const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0, duplicates: 0 });
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      const source = IMPORT_SOURCES.find((s) => s.id === config.source);
      if (!source) throw new Error('Invalid source');

      // Create import job via edge function
      const { data, error } = await supabase.functions.invoke('background-import-manager', {
        body: {
          action: 'create',
          import_type: config.source === 'csv' ? `${config.contentType}-csv` : config.source,
          content_type: config.contentType,
          config: {
            ...config.options,
            duplicate_strategy: config.duplicateStrategy,
            source_type: source.sourceType,
          },
        },
      });

      if (error) throw error;

      setJobId(data?.job_id ?? null);
      setActiveStep(1);
      setStatus('processing');

      // Poll for progress
      pollProgress(data?.job_id);

      toast.success('Import job started');
    } catch (err) {
      toast.error(
        `Failed to start import: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setIsStarting(false);
    }
  }, [config]);

  const pollProgress = useCallback(async (id: string) => {
    if (!id) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('import_jobs' as any)
        .select(
          'status, progress_percentage, total_records, valid_records, invalid_records, duplicate_records',
        )
        .eq('id', id)
        .maybeSingle();

      if (!data) return;

      setProgress(data.progress_percentage ?? 0);
      setStatus(data.status ?? 'processing');
      setStats({
        total: data.total_records ?? 0,
        valid: data.valid_records ?? 0,
        invalid: data.invalid_records ?? 0,
        duplicates: data.duplicate_records ?? 0,
      });

      if (['completed', 'failed', 'cancelled'].includes(data.status)) {
        clearInterval(interval);
        if (data.status === 'completed') {
          setProgress(100);
          setTimeout(() => setActiveStep(2), 1500);
        }
      }
    }, 3000);
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Upload size={24} style={{ color: '#10b981' }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Import Wizard
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, borderColor: 'divider' }}>
        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step content */}
        {activeStep === 0 && <ConfigureStep config={config} setConfig={setConfig} />}
        {activeStep === 1 && (
          <ImportStep jobId={jobId} progress={progress} status={status} stats={stats} />
        )}
        {activeStep === 2 && <ReviewStep jobId={jobId} />}

        {/* Navigation */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4, gap: 1.5 }}>
            <Button
              variant="contained"
              onClick={handleStart}
              disabled={isStarting || !config.source}
              startIcon={
                isStarting ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Play size={16} />
                )
              }
              sx={{ textTransform: 'none' }}
            >
              {isStarting ? 'Starting...' : 'Start Import'}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
