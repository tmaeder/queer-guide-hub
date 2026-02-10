import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accessibility, Heart, Shield, Users } from 'lucide-react';

export default function AccessibilityHub() {
  return (
    <div className="w-full p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <Accessibility className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-4xl font-bold">Accessibility Hub</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Customize your experience with accessibility features designed to make our platform 
          more inclusive and easier to use for everyone.
        </p>
      </div>

      {/* Commitment Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            Our Accessibility Commitment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            We believe technology should be accessible to everyone. Our platform is designed 
            following WCAG 2.1 AA guidelines to ensure equal access for users with disabilities.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="w-fit">
                <Accessibility className="h-3 w-3 mr-1" />
                WCAG 2.1 AA
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="w-fit">
                <Shield className="h-3 w-3 mr-1" />
                Screen Reader
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="w-fit">
                <Users className="h-3 w-3 mr-1" />
                Inclusive Design
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Accessibility Controls */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Accessibility Settings</h2>
          <p className="text-muted-foreground">
            Adjust these settings to customize your experience. Your preferences will be saved 
            automatically and applied across the entire platform.
          </p>
        </div>
        
        <AccessibilityControls />
      </div>

      <Separator />

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
          <CardDescription>
            Learn more about accessibility and get support
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Need Help?</h4>
              <p className="text-sm text-muted-foreground">
                If you're experiencing accessibility issues or need assistance, 
                please contact our support team at accessibility@queer.guide
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Feedback</h4>
              <p className="text-sm text-muted-foreground">
                We're constantly improving our accessibility features. 
                Share your feedback to help us make the platform better for everyone.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}