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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <Shield style={{ height: 16, width: 16 }} />
          <AlertDescription>
            Administrative access granted for financial data review.
            This access has been logged for audit purposes.
          </AlertDescription>
        </Alert>
        {children}
      </Box>
    );
  }

  // Admin access request interface
  if (isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main' }}>
              <DollarSign style={{ height: 20, width: 20 }} />
              Protected Financial Information
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert>
              <AlertTriangle style={{ height: 16, width: 16 }} />
              <AlertDescription>
                This user's financial data ({dataType.replace('_', ' ')}) is protected by enhanced security measures.
                Administrative access requires detailed justification and is subject to audit.
              </AlertDescription>
            </Alert>

            <Dialog open={isAccessDialogOpen} onOpenChange={setIsAccessDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" style={{ width: '100%' }}>
                  <Shield style={{ height: 16, width: 16, marginRight: 8 }} />
                  Request Administrative Access
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Financial Data Access Request</DialogTitle>
                </DialogHeader>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Alert>
                    <AlertTriangle style={{ height: 16, width: 16 }} />
                    <AlertDescription>
                      This request will be logged and audited. Provide detailed justification
                      for accessing this user's financial information.
                    </AlertDescription>
                  </Alert>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Label htmlFor="justification">
                      Justification (minimum 20 characters required)
                    </Label>
                    <Textarea
                      id="justification"
                      placeholder="Provide detailed justification for accessing this financial data. Include legal basis, business need, and intended use..."
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      style={{ minHeight: '100px' }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {justification.length}/20 characters minimum
                    </Typography>
                  </Box>

                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle style={{ height: 16, width: 16 }} />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      onClick={requestFinancialAccess}
                      disabled={loading || justification.length < 20}
                      style={{ flex: 1 }}
                    >
                      {loading ? 'Processing...' : 'Submit Access Request'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsAccessDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              </DialogContent>
            </Dialog>

            <Typography variant="caption" color="text.secondary">
              <p><strong>Note:</strong> All financial data access is logged and monitored.</p>
              <p>Emergency access procedures may apply for urgent legal compliance needs.</p>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Default deny - show fallback or nothing
  return (
    <Card>
      <CardContent sx={{ p: 3, textAlign: 'center' }}>
        <Lock style={{ height: 32, width: 32, margin: '0 auto 8px', color: 'var(--muted-foreground)' }} />
        <Typography color="text.secondary">
          Financial information is protected and not accessible.
        </Typography>
        {fallback}
      </CardContent>
    </Card>
  );
}
