import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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
    <Card className="w-full">
      <CardHeader className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">Create Your Account</CardTitle>
            <CardDescription>
              Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="shrink-0"
          >
            Back to Login
          </Button>
        </div>
        
        <div className="space-y-3">
          <Progress value={progressPercentage} className="w-full h-2" />
          <div className="flex justify-between text-sm">
            {stepTitles.map((title, index) => (
              <div 
                key={index}
                className="flex flex-col items-center gap-1 text-center"
              >
                <span 
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStep > index 
                      ? 'bg-primary text-primary-foreground' 
                      : currentStep === index + 1
                      ? 'bg-primary/20 text-primary border border-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`text-xs ${
                  currentStep >= index + 1 ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="min-h-[400px]">
          {renderStep()}
        </div>

        <div className="flex justify-between pt-6 border-t">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1 || isLoading}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          {currentStep < totalSteps ? (
            <Button onClick={nextStep} disabled={isLoading}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}