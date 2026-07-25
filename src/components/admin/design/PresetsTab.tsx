import { useMemo, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { presetOverrideCount, useBrandingPresets } from './useBrandingPresets';

function fmt(dt: string) {
  return new Date(dt).toLocaleString();
}

function ScheduleDialog({ presetIds }: { presetIds: Array<{ id: string; name: string }> }) {
  const { createSchedule } = useBrandingPresets();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');

  const submit = async () => {
    if (!preset || !starts) return;
    await createSchedule.mutateAsync({
      presetId: preset,
      startsAt: new Date(starts).toISOString(),
      endsAt: ends ? new Date(ends).toISOString() : null,
    });
    setOpen(false);
    setPreset('');
    setStarts('');
    setEnds('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={presetIds.length === 0}>
          <CalendarClock className="mr-1 h-4 w-4" /> Schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a preset</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-2xs uppercase tracking-wide text-muted-foreground">Preset</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a preset" />
              </SelectTrigger>
              <SelectContent>
                {presetIds.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
              Publish at
            </Label>
            <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
              Revert at (optional)
            </Label>
            <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            <p className="text-2xs text-muted-foreground">
              At revert time the branding returns to whatever was published before this preset. Takes
              effect within ~5–10 minutes of the set time.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!preset || !starts || createSchedule.isPending}>
            {createSchedule.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PresetsTab() {
  const { presets, schedules, savePreset, applyPreset, deletePreset, cancelSchedule } =
    useBrandingPresets();
  const [name, setName] = useState('');

  const presetById = useMemo(
    () => new Map((presets.data ?? []).map((p) => [p.id, p])),
    [presets.data],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-title">Presets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
                Save current draft as a preset
              </Label>
              <Input
                value={name}
                maxLength={80}
                placeholder="e.g. Pride Month"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={!name.trim() || savePreset.isPending}
              onClick={async () => {
                await savePreset.mutateAsync(name.trim());
                setName('');
              }}
            >
              Save
            </Button>
          </div>

          {presets.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {presets.data?.length === 0 && (
            <p className="text-13 text-muted-foreground">No presets yet.</p>
          )}
          <div className="space-y-2">
            {presets.data?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-element border p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-2xs text-muted-foreground">
                    {presetOverrideCount(p.doc)} overrides · saved {fmt(p.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={applyPreset.isPending}
                    onClick={() => applyPreset.mutate(p.id)}
                  >
                    Apply to draft
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Delete ${p.name}`}
                    disabled={deletePreset.isPending}
                    onClick={() => deletePreset.mutate(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-title">Schedule</CardTitle>
          <ScheduleDialog presetIds={(presets.data ?? []).map((p) => ({ id: p.id, name: p.name }))} />
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {schedules.data?.length === 0 && (
            <p className="text-13 text-muted-foreground">No upcoming or active schedules.</p>
          )}
          {schedules.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-element border p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">
                    {presetById.get(s.preset_id)?.name ?? 'Preset'}
                  </p>
                  <Badge variant={s.status === 'active' ? 'default' : 'outline'} className="text-2xs">
                    {s.status}
                  </Badge>
                </div>
                <p className="text-2xs text-muted-foreground">
                  {fmt(s.starts_at)}
                  {s.ends_at ? ` → ${fmt(s.ends_at)}` : ' (no auto-revert)'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={cancelSchedule.isPending}
                onClick={() => cancelSchedule.mutate(s.id)}
              >
                Cancel
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
