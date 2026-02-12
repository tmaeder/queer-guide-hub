import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Step components
import BasicInfoStep from './steps/BasicInfoStep';
import PersonalDetailsStep from './steps/PersonalDetailsStep';
import PreferencesStep from './steps/PreferencesStep';
import AccountSetupStep from './steps/AccountSetupStep';
import ReviewStep from './steps/ReviewStep';

export interface SignupData {
  // Basic Info (Step 1)
  email: string;
  password: string;
  confirmPassword: string;

  // Personal Details (Step 2)
  displayName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  location: string;

  // Identity (Step 3)
  pronouns: string;
  genderIdentity: string;
  sexualOrientation: string;
  relationshipStatus: string;

  // Preferences (Step 4)
  lookingFor: string[];
  interests: string[];
  ageRangePreference: string;
  locationRadius: string;

  // Account Setup (Step 5)
  bio: string;
  profileVisibility: string;
  emailNotifications: boolean;
  matchNotifications: boolean;
  avatarUrl?: string;
  avatarConfig?: any;
  avatarType?: 'upload' | 'builder' | 'gravatar';
}

const initialData: SignupData = {
  email: '',
  password: '',
  confirmPassword: '',
  displayName: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  location: '',
  pronouns: '',
  genderIdentity: '',
  sexualOrientation: '',
  relationshipStatus: '',
  lookingFor: [],
  interests: [],
  ageRangePreference: '',
  locationRadius: '',
  bio: '',
  profileVisibility: 'public',
  emailNotifications: true,
  matchNotifications: true,
  avatarUrl: undefined,
  avatarConfig: undefined,
  avatarType: undefined,
};

interface MultiStepSignupProps {
  onBack: () => void;
}

export default function MultiStepSignup({ onBack }: MultiStepSignupProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<SignupData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signUp } = useAuth();
  const { toast } = useToast();

  const totalSteps = 6;
  const stepTitles = [
    'Account Info',
    'Personal Details',
    'Identity',
    'Preferences',
    'Avatar & Setup',
    'Review & Complete'
  ];

  const updateData = (updates: Partial<SignupData>) => {
    setData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!data.email || !data.password || !data.confirmPassword) {
          setError('Please fill in all required fields');
          return false;
        }
        if (data.password !== data.confirmPassword) {
          setError('Passwords do not match');
          return false;
        }
        if (data.password.length < 8) {
          setError('Password must be at least 8 characters long');
          return false;
        }
        // Enhanced password security requirements
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
          setError('Password must contain at least one uppercase letter, one lowercase letter, and one number');
          return false;
        }
        break;
      case 2:
        if (!data.displayName || !data.firstName || !data.lastName) {
          setError('Please fill in all required fields');
          return false;
        }
        break;
      case 3:
        if (!data.pronouns || !data.genderIdentity) {
          setError('Please select your pronouns and gender identity');
          return false;
        }
        break;
      case 4:
        if (data.lookingFor.length === 0) {
          setError('Please select what you\'re looking for');
          return false;
        }
        break;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await signUp(data.email, data.password, {
        display_name: data.displayName,
        first_name: data.firstName,
        last_name: data.lastName,
        location: data.location,
        pronouns: data.pronouns,
        gender_identity: data.genderIdentity,
        looking_for: data.lookingFor,
        bio: data.bio,
        avatar_url: data.avatarUrl,
        avatar_config: data.avatarConfig,
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          setError('An account with this email already exists. Please sign in instead.');
        } else if (error.message.includes('Password should be at least')) {
          setError('Password must be at least 8 characters long with uppercase, lowercase, and number');
        } else {
          setError(error.message);
        }
      } else {
        toast({
          title: "Account created successfully!",
          description: "Please check your email to confirm your account before signing in.",
        });
        onBack(); // Switch back to login
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
        case 1:
          return (
            <BasicInfoStep
              data={data}
              updateData={updateData}
            />
          );
      case 2:
        return <PersonalDetailsStep data={data} updateData={updateData} />;
      case 3:
        return <PersonalDetailsStep data={data} updateData={updateData} isIdentityStep />;
      case 4:
        return <PreferencesStep data={data} updateData={updateData} />;
      case 5:
        return <AccountSetupStep data={data} updateData={updateData} />;
      case 6:
        return <ReviewStep data={data} updateData={updateData} />;
      default:
        return null;
    }
  };

  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <Card>
      <CardHeader>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="h5">Create Your Account</Typography>
              <CardDescription>
                Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
              </CardDescription>
            </Box>
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              style={{ flexShrink: 0 }}
            >
              Back to Login
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Progress value={progressPercentage} style={{ width: '100%', height: 8 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              {stepTitles.map((title, index) => (
                <Box
                  key={index}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, textAlign: 'center' }}
                >
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      ...(currentStep > index
                        ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
                        : currentStep === index + 1
                        ? { bgcolor: 'rgba(var(--primary), 0.2)', color: 'primary.main', border: 1, borderColor: 'primary.main' }
                        : { bgcolor: 'action.hover', color: 'text.secondary' }
                      ),
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: currentStep >= index + 1 ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {title}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </CardHeader>

      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Box sx={{ minHeight: 400 }}>
            {renderStep()}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 3, borderTop: 1, borderColor: 'divider' }}>
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1 || isLoading}
            >
              <ChevronLeft style={{ width: 16, height: 16, marginRight: 8 }} />
              Previous
            </Button>

            {currentStep < totalSteps ? (
              <Button onClick={nextStep} disabled={isLoading}>
                Next
                <ChevronRight style={{ width: 16, height: 16, marginLeft: 8 }} />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading && <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />}
                Create Account
              </Button>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
