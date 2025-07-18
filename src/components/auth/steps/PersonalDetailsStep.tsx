import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SignupData } from '../MultiStepSignup';

interface PersonalDetailsStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
  isIdentityStep?: boolean;
}

export default function PersonalDetailsStep({ data, updateData, isIdentityStep }: PersonalDetailsStepProps) {
  if (isIdentityStep) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold">Tell us about your identity</h3>
          <p className="text-sm text-muted-foreground">
            Help us create a more inclusive experience
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pronouns">Pronouns *</Label>
          <Select value={data.pronouns} onValueChange={(value) => updateData({ pronouns: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select your pronouns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="they/them">they/them</SelectItem>
              <SelectItem value="she/her">she/her</SelectItem>
              <SelectItem value="he/him">he/him</SelectItem>
              <SelectItem value="she/they">she/they</SelectItem>
              <SelectItem value="he/they">he/they</SelectItem>
              <SelectItem value="any">any pronouns</SelectItem>
              <SelectItem value="ask">ask me</SelectItem>
              <SelectItem value="other">other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="genderIdentity">Gender Identity *</Label>
          <Select value={data.genderIdentity} onValueChange={(value) => updateData({ genderIdentity: value })}>
            <SelectTrigger>
              <SelectValue placeholder="How do you identify?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="woman">Woman</SelectItem>
              <SelectItem value="man">Man</SelectItem>
              <SelectItem value="non-binary">Non-binary</SelectItem>
              <SelectItem value="genderfluid">Genderfluid</SelectItem>
              <SelectItem value="transgender-woman">Transgender Woman</SelectItem>
              <SelectItem value="transgender-man">Transgender Man</SelectItem>
              <SelectItem value="agender">Agender</SelectItem>
              <SelectItem value="genderqueer">Genderqueer</SelectItem>
              <SelectItem value="two-spirit">Two-Spirit</SelectItem>
              <SelectItem value="demiboy">Demiboy</SelectItem>
              <SelectItem value="demigirl">Demigirl</SelectItem>
              <SelectItem value="bigender">Bigender</SelectItem>
              <SelectItem value="pangender">Pangender</SelectItem>
              <SelectItem value="questioning">Questioning</SelectItem>
              <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sexualOrientation">Sexual Orientation</Label>
          <Select value={data.sexualOrientation} onValueChange={(value) => updateData({ sexualOrientation: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Optional - How do you identify?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lesbian">Lesbian</SelectItem>
              <SelectItem value="gay">Gay</SelectItem>
              <SelectItem value="bisexual">Bisexual</SelectItem>
              <SelectItem value="pansexual">Pansexual</SelectItem>
              <SelectItem value="queer">Queer</SelectItem>
              <SelectItem value="asexual">Asexual</SelectItem>
              <SelectItem value="demisexual">Demisexual</SelectItem>
              <SelectItem value="sapiosexual">Sapiosexual</SelectItem>
              <SelectItem value="questioning">Questioning</SelectItem>
              <SelectItem value="heterosexual">Heterosexual</SelectItem>
              <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="relationshipStatus">Current Relationship Status</Label>
          <Select value={data.relationshipStatus} onValueChange={(value) => updateData({ relationshipStatus: value })}>
            <SelectTrigger>
              <SelectValue placeholder="What's your current situation?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="partnered">In a relationship</SelectItem>
              <SelectItem value="married">Married</SelectItem>
              <SelectItem value="polyamorous">Polyamorous</SelectItem>
              <SelectItem value="open-relationship">In an open relationship</SelectItem>
              <SelectItem value="its-complicated">It's complicated</SelectItem>
              <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Personal Information</h3>
        <p className="text-sm text-muted-foreground">
          Help others get to know you better
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name *</Label>
        <Input
          id="displayName"
          type="text"
          placeholder="How you'd like to be called publicly"
          value={data.displayName}
          onChange={(e) => updateData({ displayName: e.target.value })}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            type="text"
            placeholder="Your first name"
            value={data.firstName}
            onChange={(e) => updateData({ firstName: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            type="text"
            placeholder="Your last name"
            value={data.lastName}
            onChange={(e) => updateData({ lastName: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dateOfBirth">Date of Birth</Label>
        <Input
          id="dateOfBirth"
          type="date"
          value={data.dateOfBirth}
          onChange={(e) => updateData({ dateOfBirth: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          type="text"
          placeholder="City, State/Province, Country"
          value={data.location}
          onChange={(e) => updateData({ location: e.target.value })}
        />
      </div>
    </div>
  );
}