import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import type { SignupData } from '../MultiStepSignup';

interface PreferencesStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

const lookingForOptions = [
  'New friends',
  'Dating',
  'Long-term relationship',
  'Casual dating',
  'Activity partners',
  'Professional networking',
  'Community involvement',
  'Mentorship',
  'Support groups',
  'Creative collaborations'
];

const interestOptions = [
  'Arts & Culture',
  'Music',
  'Sports & Fitness',
  'Technology',
  'Travel',
  'Food & Cooking',
  'Books & Literature',
  'Movies & TV',
  'Gaming',
  'Photography',
  'Outdoor Activities',
  'Fashion',
  'Politics & Activism',
  'Volunteering',
  'Spirituality',
  'Mental Health',
  'Pets & Animals',
  'Career Development',
  'Education',
  'Parenting'
];

export default function PreferencesStep({ data, updateData }: PreferencesStepProps) {
  const toggleLookingFor = (option: string) => {
    const current = data.lookingFor || [];
    const updated = current.includes(option)
      ? current.filter(item => item !== option)
      : [...current, option];
    updateData({ lookingFor: updated });
  };

  const toggleInterest = (option: string) => {
    const current = data.interests || [];
    const updated = current.includes(option)
      ? current.filter(item => item !== option)
      : [...current, option];
    updateData({ interests: updated });
  };

  const removeLookingFor = (option: string) => {
    const updated = (data.lookingFor || []).filter(item => item !== option);
    updateData({ lookingFor: updated });
  };

  const removeInterest = (option: string) => {
    const updated = (data.interests || []).filter(item => item !== option);
    updateData({ interests: updated });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">What are you looking for?</h3>
        <p className="text-sm text-muted-foreground">
          Help us connect you with the right people and experiences
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-base font-medium">I'm looking for: *</Label>
          <p className="text-sm text-muted-foreground mb-3">Select all that apply</p>
          
          {data.lookingFor && data.lookingFor.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {data.lookingFor.map((option) => (
                <Badge key={option} variant="secondary" className="cursor-pointer">
                  {option}
                  <X 
                    className="ml-1 h-3 w-3" 
                    onClick={() => removeLookingFor(option)}
                  />
                </Badge>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lookingForOptions.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`looking-${option}`}
                  checked={(data.lookingFor || []).includes(option)}
                  onCheckedChange={() => toggleLookingFor(option)}
                />
                <Label 
                  htmlFor={`looking-${option}`}
                  className="text-sm cursor-pointer"
                >
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-base font-medium">Interests & Hobbies</Label>
          <p className="text-sm text-muted-foreground mb-3">Select your interests (optional)</p>
          
          {data.interests && data.interests.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {data.interests.map((interest) => (
                <Badge key={interest} variant="outline" className="cursor-pointer">
                  {interest}
                  <X 
                    className="ml-1 h-3 w-3" 
                    onClick={() => removeInterest(interest)}
                  />
                </Badge>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {interestOptions.map((interest) => (
              <div key={interest} className="flex items-center space-x-2">
                <Checkbox
                  id={`interest-${interest}`}
                  checked={(data.interests || []).includes(interest)}
                  onCheckedChange={() => toggleInterest(interest)}
                />
                <Label 
                  htmlFor={`interest-${interest}`}
                  className="text-sm cursor-pointer"
                >
                  {interest}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ageRangePreference">Preferred Age Range</Label>
            <Select value={data.ageRangePreference} onValueChange={(value) => updateData({ ageRangePreference: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Age range you're interested in" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="18-25">18-25</SelectItem>
                <SelectItem value="25-35">25-35</SelectItem>
                <SelectItem value="35-45">35-45</SelectItem>
                <SelectItem value="45-55">45-55</SelectItem>
                <SelectItem value="55+">55+</SelectItem>
                <SelectItem value="any">Any age</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locationRadius">Location Preferences</Label>
            <Select value={data.locationRadius} onValueChange={(value) => updateData({ locationRadius: value })}>
              <SelectTrigger>
                <SelectValue placeholder="How far are you willing to travel?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5km">Within 5km</SelectItem>
                <SelectItem value="10km">Within 10km</SelectItem>
                <SelectItem value="25km">Within 25km</SelectItem>
                <SelectItem value="50km">Within 50km</SelectItem>
                <SelectItem value="100km">Within 100km</SelectItem>
                <SelectItem value="anywhere">Anywhere</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}