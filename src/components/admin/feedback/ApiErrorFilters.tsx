import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

export type ErrorSource = 'runtime' | 'advisor' | 'github-actions';
export type ErrorSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface ApiErrorFilterState {
  q: string;
  sources: ErrorSource[];
  severities: ErrorSeverity[];
  hideResolved: boolean;
}

export const DEFAULT_ERROR_FILTERS: ApiErrorFilterState = {
  q: '',
  sources: [],
  severities: [],
  hideResolved: true,
};

interface Props {
  state: ApiErrorFilterState;
  update: (patch: Partial<ApiErrorFilterState>) => void;
  counts?: {
    bySource: Record<ErrorSource, number>;
    bySeverity: Record<ErrorSeverity, number>;
    resolved: number;
  };
}

const SOURCE_LABELS: Record<ErrorSource, string> = {
  runtime: 'Runtime',
  advisor: 'Advisor',
  'github-actions': 'CI',
};

const SEVERITY_COLORS: Record<ErrorSeverity, string> = {
  ERROR: '#ef4444',
  WARN: '#f59e0b',
  INFO: '#6b7280',
};

/**
 * Narrow filter strip for the API Errors tab. Deliberately smaller than
 * the Community-side `FeedbackFilters` — errors have fewer useful facets
 * (service/severity, source, resolved) and the kanban status itself
 * answers the "where is this in the pipeline" question.
 *
 * Flat per the project design system: no borders on chips, magenta-only
 * accent for active state, colored dot for severity so the strip reads
 * at a glance even without reading the label.
 */
export function ApiErrorFilters({ state, update, counts }: Props) {
  const hasActive =
    state.q.length > 0 ||
    state.sources.length > 0 ||
    state.severities.length > 0 ||
    !state.hideResolved;

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        mb: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* Search — no border, only a bottom hairline on focus */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          flex: '1 1 220px',
          minWidth: 180,
          maxWidth: 320,
          borderBottom: 1,
          borderColor: state.q ? 'primary.main' : 'divider',
          py: 0.25,
          transition: 'border-color 0.15s',
          '&:focus-within': { borderColor: 'primary.main' },
        }}
      >
        <Search style={{ width: 14, height: 14, color: 'var(--muted-foreground)' }} />
        <Input
          value={state.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search message, service, rule…"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            height: 24,
            fontSize: '0.8rem',
            flex: 1,
            boxShadow: 'none',
          }}
        />
        {state.q && (
          <button
            type="button"
            onClick={() => update({ q: '' })}
            aria-label="Clear search"
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              display: 'inline-flex',
            }}
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        )}
      </Box>

      {/* Source chips */}
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Source
        </Typography>
        {(Object.keys(SOURCE_LABELS) as ErrorSource[]).map((src) => {
          const active = state.sources.includes(src);
          const n = counts?.bySource[src];
          return (
            <FilterChip
              key={src}
              active={active}
              onClick={() => update({ sources: toggle(state.sources, src) })}
              label={SOURCE_LABELS[src]}
              count={n}
            />
          );
        })}
      </Box>

      {/* Severity chips */}
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Severity
        </Typography>
        {(Object.keys(SEVERITY_COLORS) as ErrorSeverity[]).map((sev) => {
          const active = state.severities.includes(sev);
          const n = counts?.bySeverity[sev];
          return (
            <FilterChip
              key={sev}
              active={active}
              onClick={() => update({ severities: toggle(state.severities, sev) })}
              label={sev}
              dotColor={SEVERITY_COLORS[sev]}
              count={n}
            />
          );
        })}
      </Box>

      {/* Hide resolved toggle */}
      <FilterChip
        active={!state.hideResolved}
        onClick={() => update({ hideResolved: !state.hideResolved })}
        label={state.hideResolved ? 'Resolved hidden' : 'Resolved shown'}
        count={counts?.resolved}
      />

      {hasActive && (
        <button
          type="button"
          onClick={() =>
            update({ q: '', sources: [], severities: [], hideResolved: true })
          }
          style={{
            border: 0,
            background: 'transparent',
            color: 'var(--muted-foreground)',
            fontSize: '0.7rem',
            cursor: 'pointer',
            textDecoration: 'none',
            padding: 0,
          }}
        >
          clear
        </button>
      )}
    </Box>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 0,
        background: 'transparent',
        padding: '2px 6px',
        cursor: 'pointer',
        color: active ? 'hsl(var(--accent-warm))' : 'var(--muted-foreground)',
        fontWeight: active ? 700 : 500,
        fontSize: '0.72rem',
        letterSpacing: 0.2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'color 0.15s, opacity 0.15s',
        opacity: active ? 1 : 0.85,
        borderBottom: active ? '2px solid currentColor' : '2px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = 'hsl(var(--accent-warm))';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--muted-foreground)';
      }}
    >
      {dotColor && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {label}
      {typeof count === 'number' && count > 0 && (
        <span style={{ opacity: 0.6, fontWeight: 500 }}>{count}</span>
      )}
    </button>
  );
}
