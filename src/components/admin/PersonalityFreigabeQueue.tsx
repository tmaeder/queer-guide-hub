import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Check, X, RotateCcw, Lock, ClipboardCheck, ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRiskVisual } from '@/hooks/useRiskVisual';
import {
  AMPEL_RISK,
  FREIGABE_STAGES,
  FREIGABE_STAGE_META,
  type AmpelTone,
  type FreigabeStufe,
} from '@/lib/personalityStatus';
import {
  useFreigabeQueue,
  useFreigabeAction,
  type FreigabeQueueRow,
} from '@/hooks/usePersonalityFreigabe';

/**
 * Manual Freigabe queue — the "Rest manuell" half of the hybrid model. Lists the
 * persons in a selected stage (default In Prüfung) with a per-row Ampel, the
 * reasons they are flagged, and Freigeben / Ablehnen / Zurücknehmen actions.
 * Hard guards (non-person / adult / outing / duplicate) are enforced server-side;
 * an auto-gate miss requires an explicit override confirm.
 */

const REASON_LABEL: Record<string, string> = {
  needs_attention: 'Zu prüfen markiert',
  open_review_item: 'Offene Feld-Prüfung',
  duplicate: 'Duplikat',
  archived: 'Archiviert',
  rejected: 'Abgelehnt',
  missing_image: 'Kein Bild',
  no_bio: 'Keine Bio',
  relevance_below_gate: 'Relevanz < 0,7',
  no_wikidata: 'Kein Wikidata',
  is_adult: 'Adult-Kohorte',
  non_person_flag: 'Nicht-Person',
};

const GUARD_MESSAGE: Record<string, string> = {
  non_person: 'Als Nicht-Person markiert — nicht freigebbar.',
  adult_use_consent_path: 'Adult-Profil — über die Consent-Freigabe unten veröffentlichen.',
  outing_guard: 'Outing-Schutz: lebende Person mit sensibler Verbindung. Nicht freigebbar.',
  is_duplicate: 'Duplikat — zuerst zusammenführen.',
};

function AmpelDot({ tone }: { tone: AmpelTone }) {
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

export function PersonalityFreigabeQueue({
  stage,
  onStageChange,
}: {
  stage: FreigabeStufe;
  onStageChange: (s: FreigabeStufe) => void;
}) {
  const { data: rows, isLoading } = useFreigabeQueue(stage);
  const { freigeben, ablehnen, zuruecknehmen } = useFreigabeAction();
  const [busy, setBusy] = useState<string | null>(null);
  const meta = FREIGABE_STAGE_META[stage];

  const doFreigeben = async (row: FreigabeQueueRow) => {
    setBusy(row.id);
    try {
      await freigeben.mutateAsync({ id: row.id, confirm: false });
      toast.success(`„${row.name}" freigegeben`);
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e as Error).message;
      if (code === 'confirm_required') {
        // Auto-Gate nicht erfüllt → ausdrücklicher Override.
        if (
          window.confirm(
            `„${row.name}" erfüllt das Auto-Gate NICHT (unvollständig). Trotzdem manuell freigeben und öffentlich schalten?`,
          )
        ) {
          try {
            await freigeben.mutateAsync({ id: row.id, confirm: true });
            toast.success(`„${row.name}" manuell freigegeben`);
          } catch (e2) {
            toast.error(`Fehler: ${(e2 as Error).message}`);
          }
        }
      } else if (GUARD_MESSAGE[code]) {
        toast.error(GUARD_MESSAGE[code]);
      } else {
        toast.error(`Fehler: ${(e as Error).message}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const doAblehnen = async (row: FreigabeQueueRow) => {
    if (!window.confirm(`„${row.name}" ablehnen? (reversibel)`)) return;
    setBusy(row.id);
    try {
      await ablehnen.mutateAsync({ id: row.id });
      toast.success(`„${row.name}" abgelehnt`);
    } catch (e) {
      toast.error(`Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const doZuruecknehmen = async (row: FreigabeQueueRow) => {
    setBusy(row.id);
    try {
      await zuruecknehmen.mutateAsync(row.id);
      toast.success(`„${row.name}" zurückgenommen`);
    } catch (e) {
      toast.error(`Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const list = rows ?? [];
  const canFreigeben = stage !== 'veroeffentlicht' && stage !== 'abgelehnt';
  const canZuruecknehmen = stage === 'veroeffentlicht' || stage === 'abgelehnt';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ClipboardCheck size={16} />
          Freigabe-Queue
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Stage tabs */}
        <div className="flex flex-wrap gap-2">
          {FREIGABE_STAGES.map((s) => {
            const m = FREIGABE_STAGE_META[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStageChange(s)}
                className={`flex items-center gap-1.5 rounded-element border px-4 py-2 text-13 ${
                  s === stage ? 'border-foreground font-semibold' : 'border-border text-muted-foreground'
                }`}
              >
                <AmpelDot tone={m.tone} />
                {m.label}
              </button>
            );
          })}
        </div>

        <p className="text-13 text-muted-foreground">{meta.hint}.</p>

        {isLoading && <p className="text-13 text-muted-foreground">Lädt…</p>}
        {!isLoading && list.length === 0 && (
          <p className="text-13 text-muted-foreground">Keine Personen in dieser Stufe.</p>
        )}

        {list.map((row) => (
          <div key={row.id} className="flex items-center gap-4 rounded-element border p-4">
            {row.image_url ? (
              <img
                src={row.image_url}
                alt=""
                className="h-10 w-10 shrink-0 rounded-element object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-element bg-muted">
                <ImageOff size={14} className="text-muted-foreground" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <AmpelDot tone={meta.tone} />
                <Link
                  to={`/admin/content/personalities/${row.id}/datasheet`}
                  className="truncate font-medium text-foreground hover:underline"
                >
                  {row.name}
                </Link>
                {row.lgbti_relevance_score != null && (
                  <span className="shrink-0 text-13 text-muted-foreground tabular-nums">
                    rel {Math.round(row.lgbti_relevance_score * 100)}%
                  </span>
                )}
              </div>
              {(row.reasons ?? []).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(row.reasons ?? []).map((r) => (
                    <Badge key={r} variant="outline" className="font-normal">
                      {REASON_LABEL[r] ?? r}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {canFreigeben && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === row.id}
                    onClick={() => doAblehnen(row)}
                  >
                    <X size={14} className="mr-1" /> Ablehnen
                  </Button>
                  <Button size="sm" disabled={busy === row.id} onClick={() => doFreigeben(row)}>
                    {(row.reasons ?? []).some((r) => r !== 'needs_attention' && r !== 'open_review_item') ? (
                      <Lock size={14} className="mr-1" />
                    ) : (
                      <Check size={14} className="mr-1" />
                    )}
                    Freigeben
                  </Button>
                </>
              )}
              {canZuruecknehmen && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === row.id}
                  onClick={() => doZuruecknehmen(row)}
                >
                  <RotateCcw size={14} className="mr-1" /> Zurücknehmen
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
