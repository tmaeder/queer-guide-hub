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

  const totalSteps = 5;
  const stepTitles = [
    'Account Info',
    'Personal Details', 
    'Identity',
    'Preferences',
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
        if (data.password.length < 6) {
          setError('Password must be at least 6 characters long');
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
      });
      
      if (error) {
        if (error.message.includes('User already registered')) {
          setError('An account with this email already exists. Please sign in instead.');
        } else if (error.message.includes('Password should be at least')) {
          setError('Password must be at least 6 characters long');
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
        return <BasicInfoStep data={data} updateData={updateData} />;
      case 2:
        return <PersonalDetailsStep data={data} updateData={updateData} />;
      case 3:
        return <PersonalDetailsStep data={data} updateData={updateData} isIdentityStep />;
      case 4:
        return <PreferencesStep data={data} updateData={updateData} />;
      case 5:
        return <ReviewStep data={data} updateData={updateData} />;
      default:
        return null;
    }
  };

  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Create Your Account</CardTitle>
            <CardDescription>
              Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
          >
            Back to Login
          </Button>
        </div>
        
        <div className="space-y-2">
          <Progress value={progressPercentage} className="w-full" />
          <div className="flex justify-between text-sm text-muted-foreground">
            {stepTitles.map((title, index) => (
              <span 
                key={index}
                className={currentStep > index ? 'text-primary' : ''}
              >
                {index + 1}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {renderStep()}

        <div className="flex justify-between">
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