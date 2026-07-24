import { ChevronRight } from 'lucide-react';
import { useRiskVisual } from '@/hooks/useRiskVisual';
import {
  AMPEL_RISK,
  FREIGABE_STAGE_META,
  type AmpelTone,
  type FreigabeStufe,
} from '@/lib/personalityStatus';
import { useFreigabeFunnel, type FreigabeFunnel as FunnelCounts } from '@/hooks/usePersonalityFreigabe';

/**
 * Freigabe-Funnel — the multi-stage traffic-light ("Ampel") for newly captured
 * persons: Erfasst → In Prüfung → Freigabe bereit → Veröffentlicht, plus the
 * Abgelehnt sink. Monochrome except the sanctioned traffic-light dots
 * (useRiskVisual, the single locked palette). Counts from personality_freigabe_funnel().
 */

const nf = (n: number) => n.toLocaleString('de-DE');

// The forward funnel; Abgelehnt is rendered separately as a side sink.
const FORWARD: FreigabeStufe[] = ['erfasst', 'in_pruefung', 'freigabe_bereit', 'veroeffentlicht'];

function AmpelDot({ tone }: { tone: AmpelTone }) {
  // useRiskVisual is theme-aware and must be called unconditionally.
  const visual = useRiskVisual(tone !== 'gray' ? AMPEL_RISK[tone] : 'low');
  const color = tone !== 'gray' ? visual.fg : 'hsl(var(--muted-foreground))';
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

function StageCard({
  stage,
  value,
  active,
  onSelect,
}: {
  stage: FreigabeStufe;
  value: number;
  active?: boolean;
  onSelect?: (s: FreigabeStufe) => void;
}) {
  const meta = FREIGABE_STAGE_META[stage];
  const inner = (
    <div
      className={`flex min-w-[8rem] flex-1 flex-col gap-1 rounded-container border p-4 text-left ${
        active ? 'border-foreground' : 'border-border'
      }`}
      title={meta.hint}
    >
      <div className="flex items-center gap-2">
        <AmpelDot tone={meta.tone} />
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">{meta.label}</span>
      </div>
      <span className="text-display font-display tabular-nums">{nf(value)}</span>
    </div>
  );
  if (!onSelect) return inner;
  return (
    <button type="button" onClick={() => onSelect(stage)} className="flex flex-1">
      {inner}
    </button>
  );
}

export function FreigabeFunnel({
  selected,
  onSelect,
}: {
  selected?: FreigabeStufe;
  onSelect?: (s: FreigabeStufe) => void;
}) {
  const { data } = useFreigabeFunnel();
  const counts: FunnelCounts = data ?? {
    erfasst: 0,
    in_pruefung: 0,
    freigabe_bereit: 0,
    veroeffentlicht: 0,
    abgelehnt: 0,
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-display">Freigabeprozess</h2>
      <p className="text-13 text-muted-foreground">
        Ablauf neu erfasster Personen. Sichere Fälle werden nächtlich automatisch freigegeben
        (Stufe „Freigabe bereit"); der Rest wartet in „In Prüfung" auf eine manuelle Entscheidung.
      </p>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Forward funnel */}
        <div className="flex flex-1 flex-wrap items-stretch gap-2">
          {FORWARD.map((stage, i) => (
            <div key={stage} className="flex flex-1 items-center gap-2">
              <StageCard
                stage={stage}
                value={counts[stage]}
                active={selected === stage}
                onSelect={onSelect}
              />
              {i < FORWARD.length - 1 && (
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
              )}
            </div>
          ))}
        </div>
        {/* Abgelehnt sink */}
        <div className="flex lg:w-40">
          <StageCard
            stage="abgelehnt"
            value={counts.abgelehnt}
            active={selected === 'abgelehnt'}
            onSelect={onSelect}
          />
        </div>
      </div>
    </section>
  );
}
