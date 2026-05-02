import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { SignupData } from '../MultiStepSignup';

interface Props {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

const PRONOUN_OPTIONS = [
  'she/her',
  'he/him',
  'they/them',
  'she/they',
  'he/they',
  'xe/xem',
  'prefer-not-to-say',
];

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' },
];

export default function ProfileStep({ data, updateData }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {t('auth.signup.profileBlurb', 'Tell us a bit about you. You can change everything later.')}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name">{t('auth.fields.displayName', 'Display name')}</Label>
        <Input
          id="display-name"
          type="text"
          autoComplete="nickname"
          placeholder={t('auth.placeholders.displayName', 'How should we call you?')}
          value={data.displayName}
          onChange={(e) => updateData({ displayName: e.target.value })}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pronouns">{t('auth.fields.pronouns', 'Pronouns')}</Label>
        <Select value={data.pronouns} onValueChange={(v) => updateData({ pronouns: v })}>
          <SelectTrigger id="pronouns">
            <SelectValue placeholder={t('auth.placeholders.pronouns', 'Select your pronouns')} />
          </SelectTrigger>
          <SelectContent>
            {PRONOUN_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`auth.pronouns.${p}`, p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="country">{t('auth.fields.country', 'Country')}</Label>
        <Input
          id="country"
          type="text"
          autoComplete="country-name"
          placeholder={t('auth.placeholders.country', 'Optional')}
          value={data.country}
          onChange={(e) => updateData({ country: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lang">{t('auth.fields.language', 'Preferred language')}</Label>
        <Select value={data.preferredLanguage} onValueChange={(v) => updateData({ preferredLanguage: v })}>
          <SelectTrigger id="lang">
            <SelectValue placeholder={t('auth.placeholders.language', 'Select language')} />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
