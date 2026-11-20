import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CurrencySelector } from '@/components/i18n/CurrencySelector';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Language, currency, theme and accessibility: the controls the footer also carries. */
export function DisplaySettings() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Language & region</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Language">
            <LanguageSwitcher />
          </Row>
          <Row label="Currency" hint="Prices are converted to this currency.">
            <CurrencySelector />
          </Row>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Theme" hint="Light or dark.">
            <ThemeToggle />
          </Row>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Accessibility</CardTitle>
          <p className="text-sm text-muted-foreground">Saved on this device.</p>
        </CardHeader>
        <CardContent>
          <AccessibilityControls />
        </CardContent>
      </Card>
    </div>
  );
}
