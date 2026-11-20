import legacyProfileOptions from '@/config/legacyProfileTaxonomySeeds.json';
import { referenceTaxonomyRows } from '@/lib/referenceTaxonomyStore';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import { useClassificationOptions } from '@/hooks/useManagedOptions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SelectField } from './fields';
import {
  Accessibility,
  Briefcase,
  CircleDashed,
  Compass,
  DoorClosed,
  DoorOpen,
  EyeOff,
  Globe,
  Heart,
  HeartHandshake,
  Home,
  Lightbulb,
  Minus,
  Network,
  Repeat,
  Shuffle,
  Sparkles,
  User,
  Users,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { PRIDE_FLAGS, flagById } from '@/lib/flags';
import { FlagSwatch } from '@/components/tags/FlagSwatch';
import type { ProfileFormData, ComingOutStatus } from '@/types/profileForm';

const MAX_IDENTITY_FLAGS = 8;

function flag(id: string) {
  const f = flagById(id);
  return f ? <FlagSwatch flag={f} decorative className="h-3 w-5 border" /> : undefined;
}
const icon = (Icon: typeof Heart) => <Icon size={16} aria-hidden="true" />;

/** Closest curated flag per option. Romantic orientations have no flags of their
 *  own in the set, so the aro spectrum takes the aromantic flag (its grey stripe
 *  is grey-aromantic people) and bi/pan take the bi/pan flags. */
const GENDER_FLAGS = {
  non_binary: flag('nonbinary-pride'),
  genderfluid: flag('genderfluid-pride'),
  genderqueer: flag('genderqueer-pride'),
  agender: flag('agender-pride'),
  transgender_woman: flag('transgender-pride'),
  transgender_man: flag('transgender-pride'),
};
const ORIENTATION_FLAGS = {
  gay: flag('rainbow-pride'),
  lesbian: flag('lesbian-pride'),
  bisexual: flag('bisexual-pride'),
  pansexual: flag('pansexual-pride'),
  asexual: flag('asexual-pride'),
  demisexual: flag('demisexual-pride'),
  queer: flag('rainbow-pride'),
};
const ROMANTIC_FLAGS = {
  homoromantic: flag('rainbow-pride'),
  biromantic: flag('bisexual-pride'),
  panromantic: flag('pansexual-pride'),
  aromantic: flag('aromantic-pride'),
  demiromantic: flag('aromantic-pride'),
  greyromantic: flag('aromantic-pride'),
  queerplatonic: flag('rainbow-pride'),
};
const RELATIONSHIP_STATUS_ICONS = {
  single: icon(User),
  taken: icon(Heart),
  its_complicated: icon(Shuffle),
  open_to_explore: icon(Compass),
  prefer_not_to_say: icon(EyeOff),
};
const RELATIONSHIP_STYLE_ICONS = {
  monogamous: icon(Heart),
  polyamorous: icon(Users),
  relationship_anarchist: icon(Network),
  open_relationship: icon(DoorOpen),
  swinging: icon(Repeat),
  exploring: icon(Compass),
  prefer_not_to_say: icon(EyeOff),
};
const COMING_OUT_ICONS = {
  out: icon(DoorOpen),
  partially_out: icon(CircleDashed),
  not_out: icon(DoorClosed),
  not_applicable: icon(Minus),
};

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

interface IdentityTabProps {
  formData: ProfileFormData;
  onChange: (field: string, value: string) => void;
  onComingOutChange: (area: keyof ComingOutStatus, value: string) => void;
  onFlagsChange: (flags: string[]) => void;
}

function FlagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (flags: string[]) => void;
}) {
  useReferenceTaxonomy('pride_flag');

  const { t } = useTranslation();
  const atCap = selected.length >= MAX_IDENTITY_FLAGS;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((f) => f !== id));
    } else if (!atCap) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pride flags">
      {PRIDE_FLAGS.filter((flag) => {
        const terms = referenceTaxonomyRows('pride_flag');
        return (
          !terms ||
          selected.includes(flag.id) ||
          terms.some((term) => term.value === flag.id && term.is_active)
        );
      }).map((flag) => {
        const active = selected.includes(flag.id);
        const disabled = !active && atCap;
        const name = t(flag.nameKey, flag.nameEn);
        return (
          <ToggleChip
            key={flag.id}
            pressed={active}
            disabled={disabled}
            onPressedChange={() => toggle(flag.id)}
            title={name}
            icon={<FlagSwatch flag={flag} decorative className="h-3 w-5 border" />}
          >
            {/* "Pride Flag" repeats on every chip; the swatch already says it. */}
            {name.replace(/ (Pride )?Flag$/, '')}
          </ToggleChip>
        );
      })}
    </div>
  );
}

export function IdentityTab({
  formData,
  onChange,
  onComingOutChange,
  onFlagsChange,
}: IdentityTabProps) {
  const genderOptions = useClassificationOptions(
    'gender',
    GENDER_OPTIONS,
    formData.gender_identity,
  );
  const orientationOptions = useClassificationOptions(
    'orientation',
    ORIENTATION_OPTIONS,
    formData.sexual_orientation,
  );
  const chosen_familyOptions = useClassificationOptions(
    'chosen_family',
    CHOSEN_FAMILY_OPTIONS,
    formData.chosen_family_status,
  );
  const coming_outOptions = useClassificationOptions(
    'coming_out',
    COMING_OUT_OPTIONS,
    Object.values(formData.coming_out_status),
  );
  const romantic_orientationOptions = useClassificationOptions(
    'romantic_orientation',
    ROMANTIC_ORIENTATION_OPTIONS,
    formData.romantic_orientation,
  );
  const relationship_statusOptions = useClassificationOptions(
    'relationship_status',
    RELATIONSHIP_STATUS_OPTIONS,
    formData.current_relationship_status,
  );
  const relationship_styleOptions = useClassificationOptions(
    'relationship_style',
    RELATIONSHIP_STYLE_OPTIONS,
    formData.relationship_style,
  );
  const disabilityOptions = useClassificationOptions(
    'profile_disability_status',
    legacyProfileOptions.profile_disability_status,
    formData.disability_status,
  );
  const neurodivergenceOptions = useClassificationOptions(
    'profile_neurodivergent_status',
    legacyProfileOptions.profile_neurodivergent_status,
    formData.neurodivergent_status,
  );
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              id="gender_identity"
              fieldIcon={icon(Sparkles)}
              icons={GENDER_FLAGS}
              label="Gender Identity"
              value={formData.gender_identity}
              onChange={(v) => onChange('gender_identity', v)}
              options={genderOptions}
            />
            <SelectField
              id="sexual_orientation"
              fieldIcon={icon(Heart)}
              icons={ORIENTATION_FLAGS}
              label="Sexual Orientation"
              value={formData.sexual_orientation}
              onChange={(v) => onChange('sexual_orientation', v)}
              options={orientationOptions}
            />
            <SelectField
              id="romantic_orientation"
              fieldIcon={icon(HeartHandshake)}
              icons={ROMANTIC_FLAGS}
              label="Romantic Orientation"
              value={formData.romantic_orientation}
              onChange={(v) => onChange('romantic_orientation', v)}
              options={romantic_orientationOptions}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Flags</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pride flags shown on your profile. Public by default — change who sees them under
            Privacy. Up to {MAX_IDENTITY_FLAGS}.
          </p>
        </CardHeader>
        <CardContent>
          <FlagPicker selected={formData.identity_flags} onChange={onFlagsChange} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Coming Out</CardTitle>
          <p className="text-sm text-muted-foreground">
            This information is private by default and only visible to people you choose.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Alert>
              <Heart size={16} />
              <AlertDescription>
                Coming out is a deeply personal journey. All fields here are optional and private by
                default.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                id="coming_out_family"
                fieldIcon={icon(Home)}
                icons={COMING_OUT_ICONS}
                label="Family"
                placeholder="Not answered"
                value={formData.coming_out_status.family}
                onChange={(v) => onComingOutChange('family', v)}
                options={coming_outOptions}
              />
              <SelectField
                id="coming_out_friends"
                fieldIcon={icon(Users)}
                icons={COMING_OUT_ICONS}
                label="Friends"
                placeholder="Not answered"
                value={formData.coming_out_status.friends}
                onChange={(v) => onComingOutChange('friends', v)}
                options={coming_outOptions}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                id="coming_out_work"
                fieldIcon={icon(Briefcase)}
                icons={COMING_OUT_ICONS}
                label="Work / School"
                placeholder="Not answered"
                value={formData.coming_out_status.work}
                onChange={(v) => onComingOutChange('work', v)}
                options={coming_outOptions}
              />
              <SelectField
                id="coming_out_public"
                fieldIcon={icon(Globe)}
                icons={COMING_OUT_ICONS}
                label="Public"
                placeholder="Not answered"
                value={formData.coming_out_status.public}
                onChange={(v) => onComingOutChange('public', v)}
                options={coming_outOptions}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Relationships</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dating and intimacy preferences live in the intimate profile below.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              id="current_relationship_status"
              fieldIcon={icon(Heart)}
              icons={RELATIONSHIP_STATUS_ICONS}
              label="Current Status"
              value={formData.current_relationship_status}
              onChange={(v) => onChange('current_relationship_status', v)}
              options={relationship_statusOptions}
            />
            <SelectField
              id="relationship_style"
              fieldIcon={icon(Network)}
              icons={RELATIONSHIP_STYLE_ICONS}
              label="Relationship Style"
              value={formData.relationship_style}
              onChange={(v) => onChange('relationship_style', v)}
              options={relationship_styleOptions}
            />
            <SelectField
              id="chosen_family_status"
              fieldIcon={icon(Users)}
              label="Chosen Family"
              value={formData.chosen_family_status}
              onChange={(v) => onChange('chosen_family_status', v)}
              options={chosen_familyOptions}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Disability & neurodivergence</CardTitle>
          <p className="text-sm text-muted-foreground">
            Optional. Shown with your identity, under the same Privacy setting.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              id="disability_status"
              fieldIcon={icon(Accessibility)}
              label="Disability Status"
              options={disabilityOptions}
              value={formData.disability_status}
              onChange={(v) => onChange('disability_status', v)}
              placeholder="Optional"
            />
            <SelectField
              id="neurodivergent_status"
              fieldIcon={icon(Lightbulb)}
              label="Neurodivergent Status"
              options={neurodivergenceOptions}
              value={formData.neurodivergent_status}
              onChange={(v) => onChange('neurodivergent_status', v)}
              placeholder="Optional"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
