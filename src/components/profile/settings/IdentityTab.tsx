import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectField, FormField } from './fields';
import { Heart } from 'lucide-react';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { stack } from '@/lib/sx';

const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'genderfluid', label: 'Genderfluid' },
  { value: 'agender', label: 'Agender' },
  { value: 'bigender', label: 'Bigender' },
  { value: 'genderqueer', label: 'Genderqueer' },
  { value: 'demigender', label: 'Demigender' },
  { value: 'transgender_woman', label: 'Transgender woman' },
  { value: 'transgender_man', label: 'Transgender man' },
  { value: 'two_spirit', label: 'Two-Spirit' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other', label: 'Other' },
];

const ORIENTATION_OPTIONS = [
  { value: 'straight', label: 'Straight' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbian' },
  { value: 'bisexual', label: 'Bisexual' },
  { value: 'pansexual', label: 'Pansexual' },
  { value: 'asexual', label: 'Asexual' },
  { value: 'demisexual', label: 'Demisexual' },
  { value: 'queer', label: 'Queer' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other', label: 'Other' },
];

const CHOSEN_FAMILY_OPTIONS = [
  { value: 'involved', label: 'Involved in chosen family' },
  { value: 'building', label: 'Building chosen family' },
  { value: 'seeking', label: 'Seeking chosen family' },
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const COMING_OUT_OPTIONS = [
  { value: 'out', label: 'Out' },
  { value: 'partially_out', label: 'Partially out' },
  { value: 'not_out', label: 'Not out' },
  { value: 'not_applicable', label: 'Not applicable' },
];

interface IdentityTabProps {
  formData: ProfileFormData;
  onChange: (field: string, value: string) => void;
  onComingOutChange: (area: keyof ComingOutStatus, value: string) => void;
}

export function IdentityTab({ formData, onChange, onComingOutChange }: IdentityTabProps) {
  return (
    <Box sx={stack(3)}>
      {/* Core Identity */}
      <Card>
        <CardHeader>
          <CardTitle>LGBTQ+ Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={stack(2)}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <SelectField id="gender_identity" label="Gender Identity" value={formData.gender_identity} onChange={(v) => onChange('gender_identity', v)} options={GENDER_OPTIONS} />
              <SelectField id="sexual_orientation" label="Sexual Orientation" value={formData.sexual_orientation} onChange={(v) => onChange('sexual_orientation', v)} options={ORIENTATION_OPTIONS} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <SelectField id="chosen_family_status" label="Chosen Family" value={formData.chosen_family_status} onChange={(v) => onChange('chosen_family_status', v)} options={CHOSEN_FAMILY_OPTIONS} />
              <FormField id="disability_status" label="Disability Status" value={formData.disability_status} onChange={(v) => onChange('disability_status', v)} placeholder="Optional" />
            </Box>
            <FormField id="neurodivergent_status" label="Neurodivergent Status" value={formData.neurodivergent_status} onChange={(v) => onChange('neurodivergent_status', v)} placeholder="Optional — e.g., ADHD, autism, dyslexia" />
          </Box>
        </CardContent>
      </Card>

      {/* Coming Out Journey */}
      <Card>
        <CardHeader>
          <CardTitle>Coming Out Journey</CardTitle>
          <Typography variant="body2" color="text.secondary">
            This information is private by default and only visible to people you choose.
          </Typography>
        </CardHeader>
        <CardContent>
          <Box sx={stack(2)}>
            <Alert>
              <Heart style={{ width: 16, height: 16 }} />
              <AlertDescription>
                Coming out is a deeply personal journey. All fields here are optional and private by default.
              </AlertDescription>
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <SelectField id="coming_out_family" label="Family" value={formData.coming_out_status.family} onChange={(v) => onComingOutChange('family', v)} options={COMING_OUT_OPTIONS} />
              <SelectField id="coming_out_friends" label="Friends" value={formData.coming_out_status.friends} onChange={(v) => onComingOutChange('friends', v)} options={COMING_OUT_OPTIONS} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <SelectField id="coming_out_work" label="Work / School" value={formData.coming_out_status.work} onChange={(v) => onComingOutChange('work', v)} options={COMING_OUT_OPTIONS} />
              <SelectField id="coming_out_public" label="Public" value={formData.coming_out_status.public} onChange={(v) => onComingOutChange('public', v)} options={COMING_OUT_OPTIONS} />
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
