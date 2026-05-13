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
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t('auth.signup.profileBlurb', 'Tell us a bit about you. You can change everything later.')}
      </p>

      {/* Required */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="display-name" className="text-sm font-semibold">
            {t('auth.fields.displayName', 'Display name')}
          </Label>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('common.required', 'Required')}
          </span>
        </div>
        <Input
          id="display-name"
          type="text"
          autoComplete="nickname"
          placeholder={t('auth.placeholders.displayName', 'How should we call you?')}
          value={data.displayName}
          onChange={(e) => updateData({ displayName: e.target.value })}
          required
          className="h-11 rounded-xl"
        />
      </div>

      {/* Optional grouping */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
          {t('auth.signup.optionalSection', 'Optional')}
        </span>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pronouns" className="text-sm">{t('auth.fields.pronouns', 'Pronouns')}</Label>
          <Select value={data.pronouns} onValueChange={(v) => updateData({ pronouns: v })}>
            <SelectTrigger id="pronouns" className="h-11 rounded-xl bg-background">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="country" className="text-sm">{t('auth.fields.country', 'Country')}</Label>
            <Input
              id="country"
              type="text"
              autoComplete="country-name"
              placeholder={t('auth.placeholders.country', 'Optional')}
              value={data.country}
              onChange={(e) => updateData({ country: e.target.value })}
              className="h-11 rounded-xl bg-background"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="lang" className="text-sm">{t('auth.fields.language', 'Preferred language')}</Label>
            <Select value={data.preferredLanguage} onValueChange={(v) => updateData({ preferredLanguage: v })}>
              <SelectTrigger id="lang" className="h-11 rounded-xl bg-background">
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
      </div>
    </div>
  );
}
