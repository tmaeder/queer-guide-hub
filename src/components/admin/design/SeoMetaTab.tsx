import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DesignSettingsController } from './useDesignSettings';

const DEFAULTS = {
  site_name: 'Queer Guide',
  default_title: 'Queer Guide — LGBTQ+ Safe Spaces, Events & Community',
  default_description:
    'The global guide to LGBTQ+ venues, events, travel and community. Find safe spaces near you and around the world.',
  twitter_handle: '@queerguide',
};

function Field({
  label,
  value,
  placeholder,
  onChange,
  textarea,
  hint,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {textarea ? (
        <Textarea
          value={value}
          placeholder={`${placeholder} (default)`}
          maxLength={300}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          value={value}
          placeholder={`${placeholder} (default)`}
          maxLength={300}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SeoMetaTab({ controller }: { controller: DesignSettingsController }) {
  const meta = controller.draft.meta ?? {};
  const effective = {
    site_name: meta.site_name || DEFAULTS.site_name,
    title: meta.default_title || DEFAULTS.default_title,
    description: meta.default_description || DEFAULTS.default_description,
  };
  const sameas = (meta.org_sameas ?? []).join('\n');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-title">Site identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Site name"
            value={meta.site_name ?? ''}
            placeholder={DEFAULTS.site_name}
            onChange={(v) => controller.setField('meta', 'site_name', v)}
            hint="og:site_name and JSON-LD Organization name. Per-route SEO titles stay code-managed."
          />
          <Field
            label="Default title"
            value={meta.default_title ?? ''}
            placeholder={DEFAULTS.default_title}
            onChange={(v) => controller.setField('meta', 'default_title', v)}
            hint="Used for pages without a route-specific title."
          />
          <Field
            label="Default description"
            value={meta.default_description ?? ''}
            placeholder={DEFAULTS.default_description}
            onChange={(v) => controller.setField('meta', 'default_description', v)}
            textarea
          />
          <Field
            label="Twitter / X handle"
            value={meta.twitter_handle ?? ''}
            placeholder={DEFAULTS.twitter_handle}
            onChange={(v) => controller.setField('meta', 'twitter_handle', v)}
          />
          <div className="space-y-2">
            <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
              Organization profiles (sameAs, one https URL per line)
            </Label>
            <Textarea
              value={sameas}
              rows={4}
              placeholder={'https://www.instagram.com/queer.guide\nhttps://www.linkedin.com/company/queer-guide'}
              onChange={(e) =>
                controller.setField(
                  'meta',
                  'org_sameas',
                  e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
            <p className="text-2xs text-muted-foreground">
              JSON-LD Organization sameAs links (social profiles).
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Search result preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-element border p-4">
              <p className="text-2xs text-muted-foreground">queer.guide</p>
              <p className="truncate text-body-lg underline">{effective.title}</p>
              <p className="mt-1 line-clamp-2 text-13 text-muted-foreground">
                {effective.description}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Social card preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-element border">
              <div className="flex aspect-[1200/630] items-center justify-center bg-muted">
                {meta.og_image_url ? (
                  <img
                    src={meta.og_image_url}
                    alt="OG preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-13 text-muted-foreground">
                    Default OG image (/images/og-image.png)
                  </span>
                )}
              </div>
              <div className="border-t p-4">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {effective.site_name}
                </p>
                <p className="truncate text-15 font-medium">{effective.title}</p>
                <p className="line-clamp-1 text-13 text-muted-foreground">{effective.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
