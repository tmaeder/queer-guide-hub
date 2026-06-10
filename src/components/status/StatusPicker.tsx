import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AVAILABILITY_TAGS,
  AVAILABILITY_TAG_LABELS,
  useStatus,
  type StatusUpdate,
  type TravelMode,
  type AvailabilityTag,
  type UserStatus,
} from '@/hooks/useStatus';
import type { PresenceVisibility } from '@/lib/presence';
import { cn } from '@/lib/utils';

interface StatusPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DND_PRESETS: { label: string; hours: number | null }[] = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: 'Until tomorrow', hours: 24 },
  { label: 'Off', hours: null },
];

const EXPIRY_PRESETS: { label: string; hours: number | null }[] = [
  { label: '1 h', hours: 1 },
  { label: '4 h', hours: 4 },
  { label: '1 day', hours: 24 },
  { label: 'No expiry', hours: null },
];

function hoursFromNow(h: number | null): string | null {
  if (h === null) return null;
  return new Date(Date.now() + h * 3600_000).toISOString();
}

interface FormState {
  emoji: string;
  text: string;
  expiresAt: string | null;
  tags: Set<string>;
  dndUntil: string | null;
  travel: TravelMode;
  visibility: PresenceVisibility;
}

function toForm(s: UserStatus | null): FormState {
  return {
    emoji: s?.emoji ?? '',
    text: s?.text ?? '',
    expiresAt: s?.expiresAt ?? null,
    tags: new Set(s?.tags ?? []),
    dndUntil: s?.dndUntil ?? null,
    travel: s?.travel ?? {},
    visibility:
      s?.visibility ?? {
        global_dot: false,
        in_directory: false,
        in_groups: false,
        in_discovery: false,
      },
  };
}

export function StatusPicker({ open, onOpenChange }: StatusPickerProps) {
  const { status, setStatus } = useStatus();
  const [form, setForm] = useState<FormState>(toForm(status));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (open) setForm(toForm(status));
  }, [open, status]);

  const toggleTag = (t: AvailabilityTag) => {
    const next = new Set(form.tags);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setForm((f) => ({ ...f, tags: next }));
  };

  const onSave = async () => {
    setSaving(true);
    const patch: StatusUpdate = {
      emoji: form.emoji.trim() || null,
      text: form.text.trim() || null,
      expiresAt: form.expiresAt,
      tags: Array.from(form.tags),
      dndUntil: form.dndUntil,
      travel:
        form.travel.city_name || form.travel.city_id || form.travel.note
          ? form.travel
          : null,
      visibility: form.visibility,
    };
    const res = await setStatus(patch);
    setSaving(false);
    if (!res.error) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set your status</DialogTitle>
          <DialogDescription>
            Status fields are private by default. Toggle visibility per surface.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-2">
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <Input
                aria-label="Status emoji"
                value={form.emoji}
                onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value.slice(0, 8) }))}
                maxLength={8}
                placeholder="😊"
                className="text-center text-lg"
              />
              <Input
                aria-label="Status text"
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value.slice(0, 60) }))}
                maxLength={60}
                placeholder="What's up?"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant={
                    (p.hours === null && form.expiresAt === null) ||
                    (p.hours !== null && form.expiresAt && p.label === '1 h'
                      ? false
                      : false)
                      ? 'default'
                      : 'outline'
                  }
                  size="sm"
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, expiresAt: hoursFromNow(p.hours) }))
                  }
                >
                  Clear in {p.label}
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label>Available for</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={cn(
                    'rounded-badge border border-border px-2.5 py-1 text-13',
                    form.tags.has(t)
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {AVAILABILITY_TAG_LABELS[t]}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="dnd-switch">Do not disturb</Label>
              <Switch
                id="dnd-switch"
                // eslint-disable-next-line react-hooks/purity -- read-only check against current time for a toggle; second-of-resolution staleness is acceptable.
                checked={form.dndUntil !== null && new Date(form.dndUntil).getTime() > Date.now()}
                onCheckedChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    dndUntil: checked ? hoursFromNow(4) : null,
                  }))
                }
              />
            </div>
            {form.dndUntil && (
              <div className="flex flex-wrap gap-2">
                {DND_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({ ...f, dndUntil: hoursFromNow(p.hours) }))
                    }
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <Label>Travel mode</Label>
            <Input
              aria-label="Travel — city"
              value={form.travel.city_name ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  travel: { ...f.travel, city_name: e.target.value || undefined },
                }))
              }
              placeholder="Visiting which city?"
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="date"
                aria-label="Travel — until"
                value={form.travel.until ? form.travel.until.slice(0, 10) : ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    travel: {
                      ...f.travel,
                      until: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    },
                  }))
                }
              />
              {(form.travel.city_name || form.travel.until) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, travel: {} }))}
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-2 rounded-element border border-border p-4">
            <Label>Who can see this</Label>
            <p className="text-13 text-muted-foreground">
              Status defaults to invisible. Choose where it shows up.
            </p>
            {(
              [
                ['in_directory', 'On your public profile and in the user directory'],
                ['global_dot', 'Show a presence dot anywhere your avatar appears'],
                ['in_groups', 'Other members of your groups'],
                ['in_discovery', 'Discovery / cruising (if enabled)'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <Label htmlFor={`vis-${key}`} className="text-sm font-normal">
                  {label}
                </Label>
                <Switch
                  id={`vis-${key}`}
                  checked={Boolean(form.visibility[key])}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      visibility: { ...f.visibility, [key]: checked },
                    }))
                  }
                />
              </div>
            ))}
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              setSaving(true);
              await setStatus({
                emoji: null,
                text: null,
                expiresAt: null,
                tags: [],
                dndUntil: null,
                travel: null,
              });
              setSaving(false);
              onOpenChange(false);
            }}
          >
            Clear status
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
