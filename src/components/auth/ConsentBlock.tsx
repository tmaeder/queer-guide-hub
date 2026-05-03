import { useTranslation, Trans } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export interface ConsentState {
  terms: boolean;
  privacy: boolean;
  age18: boolean;
}

interface Props {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  errors?: Partial<Record<keyof ConsentState, string>>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const emptyConsent: ConsentState = { terms: false, privacy: false, age18: false };

// eslint-disable-next-line react-refresh/only-export-components
export function isConsentComplete(c: ConsentState): boolean {
  return c.terms && c.privacy && c.age18;
}

export function ConsentBlock({ value, onChange, errors }: Props) {
  const { t } = useTranslation();

  const update = (key: keyof ConsentState) => (checked: boolean | 'indeterminate') =>
    onChange({ ...value, [key]: checked === true });

  const errorClass = (k: keyof ConsentState) =>
    errors?.[k] ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Checkbox
          id="consent-terms"
          checked={value.terms}
          onCheckedChange={update('terms')}
          aria-label={t('auth.consent.termsAria', 'Accept terms of service')}
          className="mt-0.5"
        />
        <Label htmlFor="consent-terms" className={`text-sm font-normal ${errorClass('terms')}`}>
          <Trans i18nKey="auth.consent.terms">
            I agree to the <LocalizedLink to="/terms">Terms of Service</LocalizedLink>
          </Trans>
        </Label>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="consent-privacy"
          checked={value.privacy}
          onCheckedChange={update('privacy')}
          aria-label={t('auth.consent.privacyAria', 'Accept privacy policy')}
          className="mt-0.5"
        />
        <Label htmlFor="consent-privacy" className={`text-sm font-normal ${errorClass('privacy')}`}>
          <Trans i18nKey="auth.consent.privacy">
            I agree to the <LocalizedLink to="/privacy">Privacy Policy</LocalizedLink>
          </Trans>
        </Label>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="consent-age"
          checked={value.age18}
          onCheckedChange={update('age18')}
          aria-label={t('auth.consent.ageAria', 'Confirm age 18 or older')}
          className="mt-0.5"
        />
        <Label htmlFor="consent-age" className={`text-sm font-normal ${errorClass('age18')}`}>
          {t('auth.consent.age', 'I confirm I am 18 years or older')}
        </Label>
      </div>
    </div>
  );
}
