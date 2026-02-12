import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { SignupData } from '../MultiStepSignup';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';


interface BasicInfoStepProps {
  data: SignupData;
  updateData: (updates: Partial<SignupData>) => void;
}

export default function BasicInfoStep({ data, updateData }: BasicInfoStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Let's start with the basics</Typography>
        <Typography variant="body2" color="text.secondary">
          Create your account credentials
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="email">Email Address *</Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email address"
          value={data.email}
          onChange={(e) => updateData({ email: e.target.value })}
          required
        />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="password">Password *</Label>
        <Box sx={{ position: 'relative' }}>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Create a secure password (min. 8 characters)"
            value={data.password}
            onChange={(e) => updateData({ password: e.target.value })}
            required
            minLength={8}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            sx={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', height: 32, width: 32, p: 0 }}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Label htmlFor="confirmPassword">Confirm Password *</Label>
        <Box sx={{ position: 'relative' }}>
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
            sx={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', height: 32, width: 32, p: 0 }}
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            {showConfirmPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
          </Button>
        </Box>
      </Box>

      <Box sx={{ mt: 3, p: 2, bgcolor: 'action.hover', opacity: 0.5, borderRadius: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Password Requirements:</Typography>
        <Box component="ul" sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography component="li" sx={{ color: data.password.length >= 8 ? 'success.main' : 'inherit' }}>
            • At least 8 characters long
          </Typography>
          <Typography component="li" sx={{ color: /(?=.*[a-z])/.test(data.password) ? 'success.main' : 'inherit' }}>
            • One lowercase letter
          </Typography>
          <Typography component="li" sx={{ color: /(?=.*[A-Z])/.test(data.password) ? 'success.main' : 'inherit' }}>
            • One uppercase letter
          </Typography>
          <Typography component="li" sx={{ color: /(?=.*\d)/.test(data.password) ? 'success.main' : 'inherit' }}>
            • One number
          </Typography>
          <Typography component="li" sx={{ color: data.password === data.confirmPassword && data.password ? 'success.main' : 'inherit' }}>
            • Passwords match
          </Typography>
        </Box>
      </Box>

    </Box>
  );
}
