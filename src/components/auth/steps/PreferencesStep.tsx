import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

  const deleteLookingFor = (option: string) => {
    const updated = (data.lookingFor || []).filter(item => item !== option);
    updateData({ lookingFor: updated });
  };

  const deleteInterest = (option: string) => {
    const updated = (data.interests || []).filter(item => item !== option);
    updateData({ interests: updated });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>What are you looking for?</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Help us connect you with the right people and experiences
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Label sx={{ fontSize: '1rem', fontWeight: 500 }}>I'm looking for: *</Label>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>Select all that apply</Typography>

          {data.lookingFor && data.lookingFor.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              {data.lookingFor.map((option) => (
                <Badge key={option} variant="secondary" sx={{ cursor: 'pointer' }}>
                  {option}
                  <X
                    style={{ marginLeft: 4, width: 12, height: 12 }}
                    onClick={() => deleteLookingFor(option)}
                  />
                </Badge>
              ))}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
            {lookingForOptions.map((option) => (
              <Box key={option} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  id={`looking-${option}`}
                  checked={(data.lookingFor || []).includes(option)}
                  onCheckedChange={() => toggleLookingFor(option)}
                />
                <Label
                  htmlFor={`looking-${option}`}
                  sx={{ fontSize: '0.875rem', cursor: 'pointer' }}
                >
                  {option}
                </Label>
              </Box>
            ))}
          </Box>
        </Box>

        <Box>
          <Label sx={{ fontSize: '1rem', fontWeight: 500 }}>Interests & Hobbies</Label>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>Select your interests (optional)</Typography>

          {data.interests && data.interests.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              {data.interests.map((interest) => (
                <Badge key={interest} variant="outline" sx={{ cursor: 'pointer' }}>
                  {interest}
                  <X
                    style={{ marginLeft: 4, width: 12, height: 12 }}
                    onClick={() => deleteInterest(interest)}
                  />
                </Badge>
              ))}
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 1 }}>
            {interestOptions.map((interest) => (
              <Box key={interest} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  id={`interest-${interest}`}
                  checked={(data.interests || []).includes(interest)}
                  onCheckedChange={() => toggleInterest(interest)}
                />
                <Label
                  htmlFor={`interest-${interest}`}
                  sx={{ fontSize: '0.875rem', cursor: 'pointer' }}
                >
                  {interest}
                </Label>
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label htmlFor="locationRadius">Location Settings</Label>
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
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
