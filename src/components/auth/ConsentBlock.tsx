import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';

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

export const emptyConsent: ConsentState = { terms: false, privacy: false, age18: false };

export function isConsentComplete(c: ConsentState): boolean {
  return c.terms && c.privacy && c.age18;
}

export function ConsentBlock({ value, onChange, errors }: Props) {
  const { t } = useTranslation();

  const update = (key: keyof ConsentState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.checked });

  const errorColor = (k: keyof ConsentState) => (errors?.[k] ? 'error.main' : 'text.secondary');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={value.terms}
            onChange={update('terms')}
            inputProps={{ 'aria-label': t('auth.consent.termsAria', 'Accept terms of service') }}
          />
        }
        label={
          <Typography variant="body2" sx={{ color: errorColor('terms') }}>
            <Trans i18nKey="auth.consent.terms">
              I agree to the <Link to="/terms">Terms of Service</Link>
            </Trans>
          </Typography>
        }
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={value.privacy}
            onChange={update('privacy')}
            inputProps={{ 'aria-label': t('auth.consent.privacyAria', 'Accept privacy policy') }}
          />
        }
        label={
          <Typography variant="body2" sx={{ color: errorColor('privacy') }}>
            <Trans i18nKey="auth.consent.privacy">
              I agree to the <Link to="/privacy">Privacy Policy</Link>
            </Trans>
          </Typography>
        }
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={value.age18}
            onChange={update('age18')}
            inputProps={{ 'aria-label': t('auth.consent.ageAria', 'Confirm age 18 or older') }}
          />
        }
        label={
          <Typography variant="body2" sx={{ color: errorColor('age18') }}>
            {t('auth.consent.age', 'I confirm I am 18 years or older')}
          </Typography>
        }
      />
    </Box>
  );
}
