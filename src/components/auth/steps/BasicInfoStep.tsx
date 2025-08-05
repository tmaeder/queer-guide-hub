import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { SignupData } from '../MultiStepSignup';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';

interface BasicInfoStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
  onCaptchaVerify?: (token: string) => void;
}

export default function BasicInfoStep({ data, updateData, onCaptchaVerify }: BasicInfoStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Let's start with the basics</h3>
        <p className="text-sm text-muted-foreground">
          Create your account credentials
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email Address *</Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email address"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password *</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Create a secure password (min. 6 characters)"
            value={data.password}
            onChange={(e) => updateData({ password: e.target.value })}
            required
            minLength={6}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password *</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm your password"
            value={data.confirmPassword}
            onChange={(e) => updateData({ confirmPassword: e.target.value })}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h4 className="font-medium mb-2">Password Requirements:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li className={data.password.length >= 6 ? 'text-green-600' : ''}>
            • At least 6 characters long
          </li>
          <li className={data.password === data.confirmPassword && data.password ? 'text-green-600' : ''}>
            • Passwords match
          </li>
        </ul>
      </div>

      {/* Captcha Verification */}
      <div className="space-y-2">
        <Label>Security Verification</Label>
        <TurnstileWidget 
          onVerify={onCaptchaVerify || (() => {})}
          action="signup"
          className="flex justify-center"
        />
      </div>
    </div>
  );
}