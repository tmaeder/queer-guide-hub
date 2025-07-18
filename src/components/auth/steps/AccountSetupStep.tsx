import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { SignupData } from '../MultiStepSignup';

interface AccountSetupStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function AccountSetupStep({ data, updateData }: AccountSetupStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Finish setting up your account</h3>
        <p className="text-sm text-muted-foreground">
          Add some final touches to your profile
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          placeholder="Tell us a bit about yourself... What makes you unique? What are you passionate about?"
          value={data.bio}
          onChange={(e) => updateData({ bio: e.target.value })}
          rows={4}
          maxLength={500}
        />
        <div className="text-right text-xs text-muted-foreground">
          {data.bio.length}/500 characters
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profileVisibility">Profile Visibility</Label>
        <Select value={data.profileVisibility} onValueChange={(value) => updateData({ profileVisibility: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Who can see your profile?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public - Anyone can find and view my profile</SelectItem>
            <SelectItem value="community">Community only - Only registered members can see my profile</SelectItem>
            <SelectItem value="private">Private - Only people I approve can see my profile</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <Label className="text-base font-medium">Notification Preferences</Label>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="emailNotifications"
              checked={data.emailNotifications}
              onCheckedChange={(checked) => updateData({ emailNotifications: checked as boolean })}
            />
            <Label htmlFor="emailNotifications" className="text-sm">
              Email notifications for important updates
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="matchNotifications"
              checked={data.matchNotifications}
              onCheckedChange={(checked) => updateData({ matchNotifications: checked as boolean })}
            />
            <Label htmlFor="matchNotifications" className="text-sm">
              Notifications for new matches and messages
            </Label>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Privacy & Safety</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Your email address will never be shared publicly</li>
          <li>• You can change your privacy settings anytime</li>
          <li>• You control who can contact you</li>
          <li>• Report any inappropriate behavior to our moderation team</li>
        </ul>
      </div>
    </div>
  );
}