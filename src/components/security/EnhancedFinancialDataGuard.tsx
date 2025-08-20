import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DollarSign, Shield, Lock, AlertTriangle } from 'lucide-react';

interface FinancialDataGuardProps {
  children: React.ReactNode;
  userId: string;
  dataType: 'income_range' | 'payment_methods' | 'donations' | 'financial_summary';
  fallback?: React.ReactNode;
}

export function EnhancedFinancialDataGuard({
  children,
  userId,
  dataType,
  fallback = null
}: FinancialDataGuardProps) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [justification, setJustification] = useState('');
  const [accessGranted, setAccessGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owner always has access to their own financial data
  if (user?.id === userId) {
    return <>{children}</>;
  }

  const requestFinancialAccess = async () => {
    if (!isAdmin || !justification.trim()) {
      setError('Valid justification required (minimum 20 characters)');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.rpc('check_financial_data_access', {
        p_user_id: userId,
        p_admin_user_id: user?.id,
        p_justification: justification.trim()
      });

      if (error) throw error;

      if (data === true) {
        setAccessGranted(true);
        setIsAccessDialogOpen(false);
        
        // Additional audit log for financial access
        await supabase.rpc('audit_admin_sensitive_access', {
          p_admin_id: user?.id,
          p_target_user_id: userId,
          p_data_type: dataType,
          p_justification: justification.trim()
        });
      } else {
        setError('Access denied. Justification may be insufficient or additional approval required.');
      }
    } catch (err) {
      console.error('Error requesting financial access:', err);
      setError('Failed to process access request');
    } finally {
      setLoading(false);
    }
  };

  // Show financial data if access has been granted
  if (accessGranted) {
    return (
      <div className="space-y-4">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Administrative access granted for financial data review.
            This access has been logged for audit purposes.
          </AlertDescription>
        </Alert>
        {children}
      </div>
    );
  }

  // Admin access request interface
  if (isAdmin) {
    return (
      <Card className="border-warning">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-warning">
            <DollarSign className="h-5 w-5" />
            Protected Financial Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This user's financial data ({dataType.replace('_', ' ')}) is protected by enhanced security measures.
              Administrative access requires detailed justification and is subject to audit.
            </AlertDescription>
          </Alert>

          <Dialog open={isAccessDialogOpen} onOpenChange={setIsAccessDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Shield className="h-4 w-4 mr-2" />
                Request Administrative Access
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Financial Data Access Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This request will be logged and audited. Provide detailed justification
                    for accessing this user's financial information.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="justification">
                    Justification (minimum 20 characters required)
                  </Label>
                  <Textarea
                    id="justification"
                    placeholder="Provide detailed justification for accessing this financial data. Include legal basis, business need, and intended use..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <div className="text-xs text-muted-foreground">
                    {justification.length}/20 characters minimum
                  </div>
                </div>

                {error && (
                  <Alert className="border-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={requestFinancialAccess}
                    disabled={loading || justification.length < 20}
                    className="flex-1"
                  >
                    {loading ? 'Processing...' : 'Submit Access Request'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsAccessDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="text-xs text-muted-foreground">
            <p><strong>Note:</strong> All financial data access is logged and monitored.</p>
            <p>Emergency access procedures may apply for urgent legal compliance needs.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default deny - show fallback or nothing
  return (
    <Card className="border-muted">
      <CardContent className="p-6 text-center">
        <Lock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">
          Financial information is protected and not accessible.
        </p>
        {fallback}
      </CardContent>
    </Card>
  );
}