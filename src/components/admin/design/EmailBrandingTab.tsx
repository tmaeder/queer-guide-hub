import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandUploadField } from './BrandUploadField';
import type { DesignSettingsController } from './useDesignSettings';

const DEFAULTS = {
  from_name: 'The Queer Guide',
  from_address: 'noreply@queer.guide',
  wrapper_bg: '#0a0a0a',
  wrapper_fg: '#fafafa',
};

export function EmailBrandingTab({ controller }: { controller: DesignSettingsController }) {
  const email = controller.draft.email ?? {};
  const effective = {
    from_name: email.from_name || DEFAULTS.from_name,
    from_address: email.from_address || DEFAULTS.from_address,
    wrapper_bg: email.wrapper_bg || DEFAULTS.wrapper_bg,
    wrapper_fg: email.wrapper_fg || DEFAULTS.wrapper_fg,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Sender</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
                From name
              </Label>
              <Input
                value={email.from_name ?? ''}
                aria-invalid={!!controller.validationErrors['email.from_name']}
                className={controller.validationErrors['email.from_name'] ? 'border-destructive' : ''}
                placeholder={`${DEFAULTS.from_name} (default)`}
                maxLength={100}
                onChange={(e) => controller.setField('email', 'from_name', e.target.value)}
              />
              {controller.validationErrors['email.from_name'] && (
                <p className="text-2xs text-destructive">
                  {controller.validationErrors['email.from_name']}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
                From address
              </Label>
              <Input
                value={email.from_address ?? ''}
                aria-invalid={!!controller.validationErrors['email.from_address']}
                className={controller.validationErrors['email.from_address'] ? 'border-destructive' : ''}
                placeholder={`${DEFAULTS.from_address} (default)`}
                maxLength={100}
                onChange={(e) => controller.setField('email', 'from_address', e.target.value)}
              />
              {controller.validationErrors['email.from_address'] ? (
                <p className="text-2xs text-destructive">
                  {controller.validationErrors['email.from_address']}
                </p>
              ) : (
                <p className="text-2xs text-muted-foreground">
                  The domain must be verified with the email provider — an unverified address will
                  bounce sends.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-title">Wrapper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BrandUploadField
              label="Header logo"
              hint="Absolute https URL — email clients cannot resolve relative paths."
              value={email.logo_url ?? ''}
              onChange={(v) => controller.setField('email', 'logo_url', v)}
              error={controller.validationErrors['email.logo_url']}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {(['wrapper_bg', 'wrapper_fg'] as const).map((key) => (
                <div key={key} className="space-y-2">
                  <Label className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {key === 'wrapper_bg' ? 'Wrapper background' : 'Wrapper text'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(email[key] ?? '') ? email[key]! : DEFAULTS[key]}
                      onChange={(e) => controller.setField('email', key, e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-element border bg-background p-1"
                      aria-label={key}
                    />
                    <Input
                      value={email[key] ?? ''}
                      aria-invalid={!!controller.validationErrors[`email.${key}`]}
                      placeholder={`${DEFAULTS[key]} (default)`}
                      maxLength={7}
                      className={`w-32 font-mono text-13 ${controller.validationErrors[`email.${key}`] ? 'border-destructive' : ''}`}
                      onChange={(e) => controller.setField('email', key, e.target.value)}
                    />
                  </div>
                  {controller.validationErrors[`email.${key}`] && (
                    <p className="text-2xs text-destructive">
                      {controller.validationErrors[`email.${key}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Link
          to="/admin/email-templates"
          className="flex items-center justify-between rounded-container border p-4 hover:bg-muted"
        >
          <div>
            <p className="text-15 font-medium">Email templates</p>
            <p className="text-13 text-muted-foreground">
              Edit individual template content and variables.
            </p>
          </div>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-title">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-13 text-muted-foreground">
            From: <span className="font-mono">{`${effective.from_name} <${effective.from_address}>`}</span>
          </p>
          <div
            className="rounded-element border p-6"
            style={{ backgroundColor: effective.wrapper_bg, color: effective.wrapper_fg }}
          >
            {email.logo_url ? (
              <img src={email.logo_url} alt="Email logo" className="mb-4 h-8 w-auto" />
            ) : (
              <p className="mb-4 text-15 font-medium">{effective.from_name}</p>
            )}
            <div className="rounded-element bg-white p-4 text-sm text-black">
              Template content renders here — this wrapper frames every templated email.
            </div>
            <p className="mt-4 text-2xs opacity-70">© Queer Guide · queer.guide</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
