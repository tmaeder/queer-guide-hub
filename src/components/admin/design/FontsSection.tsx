import { Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandUploadField } from './BrandUploadField';
import { FONT_SLOTS, type FontFile, type FontSlot, type FontSlotKey } from './tokenCatalog';
import type { DesignSettingsController } from './useDesignSettings';

const WEIGHTS = ['300', '400', '500', '600', '700', '100 900'];

function FileRow({
  file,
  onChange,
  onRemove,
}: {
  file: FontFile;
  onChange: (f: FontFile) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-2 border-b border-border-hairline pb-4 last:border-b-0">
      <div className="flex-1">
        <BrandUploadField
          label="Font file (.woff2)"
          kind="font"
          value={file.url}
          onChange={(url) => onChange({ ...file, url })}
        />
      </div>
      <div className="w-28">
        <Label className="text-2xs uppercase tracking-wide text-muted-foreground">Weight</Label>
        <Select value={file.weight} onValueChange={(weight) => onChange({ ...file, weight })}>
          <SelectTrigger className="h-8 text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEIGHTS.map((w) => (
              <SelectItem key={w} value={w}>
                {w === '100 900' ? 'Variable' : w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-24">
        <Label className="text-2xs uppercase tracking-wide text-muted-foreground">Style</Label>
        <Select
          value={file.style}
          onValueChange={(style) => onChange({ ...file, style: style as 'normal' | 'italic' })}
        >
          <SelectTrigger className="h-8 text-13">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="italic">Italic</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove file" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function FontSlotEditor({
  slotKey,
  label,
  defaultFamily,
  controller,
}: {
  slotKey: FontSlotKey;
  label: string;
  defaultFamily: string;
  controller: DesignSettingsController;
}) {
  const slot = controller.draft.fonts?.[slotKey];
  const error = controller.validationErrors[`fonts.${slotKey}`];

  const update = (next: FontSlot | null) => controller.setFontSlot(slotKey, next);
  const setFiles = (files: FontFile[]) =>
    update({ family: slot?.family ?? '', files });

  return (
    <div className="space-y-4 border-b border-border-hairline pb-6 last:border-b-0">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {slot ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-2xs"
            onClick={() => update(null)}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Reset to {defaultFamily}
          </Button>
        ) : null}
      </div>

      <div>
        <Label className="text-2xs uppercase tracking-wide text-muted-foreground">Family name</Label>
        <Input
          value={slot?.family ?? ''}
          aria-invalid={!!error}
          placeholder={`${defaultFamily} (default)`}
          className={`font-mono text-13 ${error ? 'border-destructive' : ''}`}
          onChange={(e) => update({ family: e.target.value, files: slot?.files ?? [] })}
        />
      </div>

      {slot && (
        <div className="space-y-4">
          {(slot.files ?? []).map((f, i) => (
            <FileRow
              key={i}
              file={f}
              onChange={(nf) => setFiles(slot.files.map((old, j) => (j === i ? nf : old)))}
              onRemove={() => setFiles(slot.files.filter((_, j) => j !== i))}
            />
          ))}
          {(slot.files?.length ?? 0) < 4 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFiles([...(slot.files ?? []), { url: '', weight: '400', style: 'normal' }])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add font file
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-2xs text-destructive">{error}</p>}
      {!slot && (
        <p className="text-2xs text-muted-foreground">
          Enter a family name, then upload 1–4 .woff2 files. Custom fonts fall back to {defaultFamily}{' '}
          until loaded.
        </p>
      )}
    </div>
  );
}

export function FontsSection({ controller }: { controller: DesignSettingsController }) {
  return (
    <div className="space-y-6">
      {FONT_SLOTS.map((s) => (
        <FontSlotEditor
          key={s.key}
          slotKey={s.key}
          label={s.label}
          defaultFamily={s.defaultFamily}
          controller={controller}
        />
      ))}
    </div>
  );
}
