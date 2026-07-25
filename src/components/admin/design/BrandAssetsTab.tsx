import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandUploadField } from './BrandUploadField';
import type { DesignSettingsController } from './useDesignSettings';

function HexField({
  label,
  value,
  placeholder,
  onChange,
  error,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-element border bg-background p-1"
          aria-label={`${label} color picker`}
        />
        <Input
          value={value}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${placeholder} (default)`}
          maxLength={7}
          className={`w-32 font-mono text-13 ${error ? 'border-destructive' : ''}`}
        />
      </div>
      {error && <p className="text-2xs text-destructive">{error}</p>}
    </div>
  );
}

export function BrandAssetsTab({ controller }: { controller: DesignSettingsController }) {
  const meta = controller.draft.meta ?? {};
  const manifest = controller.draft.manifest ?? {};
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-title">Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <BrandUploadField
            label="Organization logo"
            hint="Used in JSON-LD structured data. Default: /icons/icon-192.png"
            value={meta.org_logo_url ?? ''}
            onChange={(v) => controller.setField('meta', 'org_logo_url', v)}
            error={controller.validationErrors['meta.org_logo_url']}
          />
          <BrandUploadField
            label="Default OG image"
            hint="1200×630 social sharing card for pages without their own image. Default: /images/og-image.png"
            value={meta.og_image_url ?? ''}
            onChange={(v) => controller.setField('meta', 'og_image_url', v)}
            previewClassName="aspect-[1200/630] w-full max-w-80"
            error={controller.validationErrors['meta.og_image_url']}
          />
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Browser & PWA identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Manifest name
                </Label>
                <Input
                  value={manifest.name ?? ''}
                  placeholder="Queer Guide (default)"
                  maxLength={100}
                  onChange={(e) => controller.setField('manifest', 'name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Short name
                </Label>
                <Input
                  value={manifest.short_name ?? ''}
                  placeholder="QueerGuide (default)"
                  maxLength={100}
                  onChange={(e) => controller.setField('manifest', 'short_name', e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <HexField
                label="Manifest theme color"
                value={manifest.theme_color ?? ''}
                placeholder="#0a0a0a"
                onChange={(v) => controller.setField('manifest', 'theme_color', v)}
                error={controller.validationErrors['manifest.theme_color']}
              />
              <HexField
                label="Manifest background"
                value={manifest.background_color ?? ''}
                placeholder="#0a0a0a"
                onChange={(v) => controller.setField('manifest', 'background_color', v)}
                error={controller.validationErrors['manifest.background_color']}
              />
            </div>
            <p className="text-2xs text-muted-foreground">
              Served live by /manifest.json — installed PWAs pick changes up on their next manifest
              refresh.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Browser theme color</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <HexField
              label="Light mode"
              value={meta.theme_color_light ?? ''}
              placeholder="#ffffff"
              onChange={(v) => controller.setField('meta', 'theme_color_light', v)}
              error={controller.validationErrors['meta.theme_color_light']}
            />
            <HexField
              label="Dark mode"
              value={meta.theme_color_dark ?? ''}
              placeholder="#0a0a0a"
              onChange={(v) => controller.setField('meta', 'theme_color_dark', v)}
              error={controller.validationErrors['meta.theme_color_dark']}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
