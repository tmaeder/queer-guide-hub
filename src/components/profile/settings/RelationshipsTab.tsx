import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectField } from './fields';
import { Heart } from 'lucide-react';
import type { ProfileFormData } from '@/types/profileForm';

const ROMANTIC_ORIENTATION_OPTIONS = [
  { value: 'heteroromantic', label: 'Heteroromantic' },
  { value: 'homoromantic', label: 'Homoromantic' },
  { value: 'biromantic', label: 'Biromantic' },
  { value: 'panromantic', label: 'Panromantic' },
  { value: 'aromantic', label: 'Aromantic' },
  { value: 'demiromantic', label: 'Demiromantic' },
  { value: 'greyromantic', label: 'Greyromantic' },
  { value: 'queerplatonic', label: 'Queerplatonic' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other', label: 'Other' },
];

const RELATIONSHIP_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'taken', label: 'Taken' },
  { value: 'its_complicated', label: "It's complicated" },
  { value: 'open_to_explore', label: 'Open to explore' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const RELATIONSHIP_STYLE_OPTIONS = [
  { value: 'monogamous', label: 'Monogamous' },
  { value: 'polyamorous', label: 'Polyamorous' },
  { value: 'relationship_anarchist', label: 'Relationship anarchist' },
  { value: 'open_relationship', label: 'Open relationship' },
  { value: 'swinging', label: 'Swinging' },
  { value: 'exploring', label: 'Exploring' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const ROMANCE_STYLE_OPTIONS = [
  { value: 'romantic', label: 'Romantic' },
  { value: 'pragmatic', label: 'Pragmatic' },
  { value: 'adventurous', label: 'Adventurous' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'spontaneous', label: 'Spontaneous' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const AFFECTION_OPTIONS = [
  { value: 'very_affectionate', label: 'Very affectionate' },
  { value: 'moderately_affectionate', label: 'Moderately affectionate' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'depends_on_context', label: 'Depends on context' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const JEALOUSY_OPTIONS = [
  { value: 'very_comfortable', label: 'Very comfortable' },
  { value: 'somewhat_comfortable', label: 'Somewhat comfortable' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'somewhat_uncomfortable', label: 'Somewhat uncomfortable' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const KINK_EXPERIENCE_OPTIONS = [
  { value: 'none', label: 'No experience' },
  { value: 'curious', label: 'Curious' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const BDSM_ROLE_OPTIONS = [
  { value: 'dominant', label: 'Dominant' },
  { value: 'submissive', label: 'Submissive' },
  { value: 'switch', label: 'Switch' },
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'exploring', label: 'Exploring' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const COMMUNICATION_OPTIONS = [
  { value: 'very_open', label: 'Very open' },
  { value: 'open', label: 'Open' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'private', label: 'Private' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const EXPLORATION_OPTIONS = [
  { value: 'very_open', label: 'Very open' },
  { value: 'open', label: 'Open' },
  { value: 'somewhat_open', label: 'Somewhat open' },
  { value: 'not_open', label: 'Not open' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const FREQUENCY_OPTIONS = [
  { value: 'very_high', label: 'Very high' },
  { value: 'high', label: 'High' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'low', label: 'Low' },
  { value: 'asexual_spectrum', label: 'Asexual spectrum' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const HEALTH_STATUS_OPTIONS = [
  { value: 'regularly_tested', label: 'Regularly tested' },
  { value: 'recently_tested', label: 'Recently tested' },
  { value: 'on_prep', label: 'On PrEP' },
  { value: 'undetectable', label: 'Undetectable' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

interface RelationshipsTabProps {
  formData: ProfileFormData;
  onChange: (field: string, value: string) => void;
}

export function RelationshipsTab({ formData, onChange }: RelationshipsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Heart style={{ width: 16, height: 16 }} />
        <AlertDescription>
          Share what you're comfortable with. All fields are optional and visibility is controlled in Privacy settings.
        </AlertDescription>
      </Alert>

      {/* Romance & Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Romance & Connection</CardTitle>
          <p className="text-sm text-muted-foreground">
            How you approach relationships and connection
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField id="romantic_orientation" label="Romantic Orientation" value={formData.romantic_orientation} onChange={(v) => onChange('romantic_orientation', v)} options={ROMANTIC_ORIENTATION_OPTIONS} />
              <SelectField id="current_relationship_status" label="Current Status" value={formData.current_relationship_status} onChange={(v) => onChange('current_relationship_status', v)} options={RELATIONSHIP_STATUS_OPTIONS} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField id="relationship_style" label="Relationship Style" value={formData.relationship_style} onChange={(v) => onChange('relationship_style', v)} options={RELATIONSHIP_STYLE_OPTIONS} />
              <SelectField id="romance_style" label="Romance Style" value={formData.romance_style} onChange={(v) => onChange('romance_style', v)} options={ROMANCE_STYLE_OPTIONS} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField id="physical_affection_preference" label="Physical Affection" value={formData.physical_affection_preference} onChange={(v) => onChange('physical_affection_preference', v)} options={AFFECTION_OPTIONS} />
              <SelectField id="jealousy_comfort_level" label="Jealousy Comfort Level" value={formData.jealousy_comfort_level} onChange={(v) => onChange('jealousy_comfort_level', v)} options={JEALOUSY_OPTIONS} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intimacy */}
      <Card>
        <CardHeader>
          <CardTitle>Intimacy</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your preferences around physical intimacy and sexual health
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField id="kink_experience_level" label="Kink Experience" value={formData.kink_experience_level} onChange={(v) => onChange('kink_experience_level', v)} options={KINK_EXPERIENCE_OPTIONS} />
              <SelectField id="bdsm_role" label="BDSM Role" value={formData.bdsm_role} onChange={(v) => onChange('bdsm_role', v)} options={BDSM_ROLE_OPTIONS} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField id="sexual_frequency_preference" label="Frequency Preference" value={formData.sexual_frequency_preference} onChange={(v) => onChange('sexual_frequency_preference', v)} options={FREQUENCY_OPTIONS} />
              <SelectField id="communication_about_sex" label="Communication About Sex" value={formData.communication_about_sex} onChange={(v) => onChange('communication_about_sex', v)} options={COMMUNICATION_OPTIONS} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField id="sexual_exploration_openness" label="Exploration Openness" value={formData.sexual_exploration_openness} onChange={(v) => onChange('sexual_exploration_openness', v)} options={EXPLORATION_OPTIONS} />
              <SelectField id="sexual_health_status" label="Sexual Health" value={formData.sexual_health_status} onChange={(v) => onChange('sexual_health_status', v)} options={HEALTH_STATUS_OPTIONS} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
