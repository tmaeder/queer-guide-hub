import { Badge } from '@/components/ui/badge';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { SignupData } from '../MultiStepSignup';

interface Props {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

const LOOKING_FOR = [
  'friends',
  'dating',
  'community',
  'events',
  'travel-tips',
  'safe-spaces',
  'activism',
  'mentorship',
];

const INTERESTS = [
  'arts-culture',
  'music',
  'nightlife',
  'fitness',
  'food',
  'travel',
  'film',
  'literature',
  'tech',
  'activism',
  'wellness',
  'fashion',
];

export default function InterestsStep({ data, updateData }: Props) {
  const { t } = useTranslation();

  const toggle = <K extends 'lookingFor' | 'interests'>(key: K, value: string) => {
    const current = data[key] || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    updateData({ [key]: next } as Partial<typeof data>);
  };

  const Section = ({
    title,
    options,
    field,
  }: {
    title: string;
    options: string[];
    field: 'lookingFor' | 'interests';
  }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {options.map((opt) => {
          const active = data[field].includes(opt);
          return (
            <Badge
              key={opt}
              variant={active ? 'default' : 'outline'}
              role="button"
              tabIndex={0}
              onClick={() => toggle(field, opt)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(field, opt);
                }
              }}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              {t(`auth.${field}.${opt}`, opt)}
            </Badge>
          );
        })}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="body2" color="text.secondary">
        {t('auth.signup.interestsBlurb', 'Optional — helps us personalise your guide. Skip if you prefer.')}
      </Typography>
      <Section
        title={t('auth.signup.lookingForTitle', "I'm looking for")}
        options={LOOKING_FOR}
        field="lookingFor"
      />
      <Section
        title={t('auth.signup.interestsTitle', 'Interests')}
        options={INTERESTS}
        field="interests"
      />
    </Box>
  );
}
