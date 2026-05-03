import { useTranslation, Trans } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Checkbox } from '@/components/ui/checkbox';

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

  const update = (key: keyof ConsentState) => (checked: boolean) =>
    onChange({ ...value, [key]: checked });

  const errorClass = (k: keyof ConsentState) =>
    errors?.[k] ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={value.terms}
          onCheckedChange={(c) => update('terms')(c === true)}
          aria-label={t('auth.consent.termsAria', 'Accept terms of service')}
        />
        <p className={`text-sm ${errorClass('terms')}`}>
          <Trans i18nKey="auth.consent.terms">
            I agree to the <LocalizedLink to="/terms">Terms of Service</LocalizedLink>
          </Trans>
        </p>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={value.privacy}
          onCheckedChange={(c) => update('privacy')(c === true)}
          aria-label={t('auth.consent.privacyAria', 'Accept privacy policy')}
        />
        <p className={`text-sm ${errorClass('privacy')}`}>
          <Trans i18nKey="auth.consent.privacy">
            I agree to the <LocalizedLink to="/privacy">Privacy Policy</LocalizedLink>
          </Trans>
        </p>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={value.age18}
          onCheckedChange={(c) => update('age18')(c === true)}
          aria-label={t('auth.consent.ageAria', 'Confirm age 18 or older')}
        />
        <p className={`text-sm ${errorClass('age18')}`}>
          {t('auth.consent.age', 'I confirm I am 18 years or older')}
        </p>
      </label>
    </div>
  );
}
