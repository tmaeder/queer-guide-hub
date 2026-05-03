import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { supabase } from '@/integrations/supabase/client';
import { listFromWhere } from '@/hooks/usePageFetchers';
import { useToast } from '@/hooks/use-toast';
import { Shield, Lock, Eye, DollarSign } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface FinancialData {
  id: string;
  amount_encrypted: string;
  status: string;
  created_at: string;
  donor_name?: string;
  email?: string;
}

interface SecureFinancialDataViewerProps {
  userId: string;
  children: React.ReactNode;
}

export function SecureFinancialDataViewer({ userId, children }: SecureFinancialDataViewerProps) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [justification, setJustification] = useState('');
  const [accessGranted, setAccessGranted] = useState(false);
  const [financialData, setFinancialData] = useState<FinancialData[]>([]);
  const [loading, setLoading] = useState(false);

  // Check if current user is the owner
  const isOwner = user?.id === userId;

  useEffect(() => {
    if (isOwner) {
      setAccessGranted(true);
      fetchFinancialData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchFinancialData defined below, re-run on isOwner/userId change
  }, [isOwner, userId]);

  const fetchFinancialData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await listFromWhere<Record<string, unknown>>(
        'donations',
        'id, amount_encrypted, status, created_at, donor_name, email',
        [{ col: 'user_id', val: userId }],
        { order: { col: 'created_at', ascending: false } },
      );
      setFinancialData(data as never);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast({
        title: "Error",
        description: "Failed to load financial data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const requestFinancialAccess = async () => {
    if (!user || !justification.trim()) {
      toast({
        title: "Error",
        description: "Please provide a detailed justification for accessing this financial data.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);

      // Check admin access with enhanced validation
      const { data: accessApproved, error } = await supabase.rpc('check_financial_data_access', {
        p_user_id: userId,
        p_admin_user_id: user.id,
        p_justification: justification
      });

      if (error) throw error;
      if (!accessApproved) {
        toast({
          title: "Access Denied",
          description: "Your request for financial data access was denied. Ensure your justification meets security requirements.",
          variant: "destructive"
        });
        return;
      }

      // Log the admin access
      await supabase.rpc('audit_admin_sensitive_access', {
        p_admin_id: user.id,
        p_target_user_id: userId,
        p_data_type: 'financial_data',
        p_justification: justification
      });

      setAccessGranted(true);
      setShowAccessDialog(false);
      fetchFinancialData();

      toast({
        title: "Access Granted",
        description: "Financial data access approved. This action has been logged for security audit.",
        variant: "default"
      });
    } catch (error) {
      console.error('Error requesting financial access:', error);
      toast({
        title: "Error",
        description: "Failed to request financial data access.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // If user is owner, show data directly
  if (isOwner && accessGranted) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <DollarSign style={{ height: 16, width: 16 }} />
          <AlertDescription>
            You're viewing your own financial data. This information is encrypted and protected.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield style={{ height: 20, width: 20 }} />
                Financial Data
              </Box>
            </CardTitle>
            <CardDescription>
              Your donation history and financial transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                <Box sx={{ animation: 'spin 1s linear infinite', height: 24, width: 24, bgcolor: 'primary.main' }} />
              </Box>
            ) : financialData.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No financial data found
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {financialData.map((item) => (
                  <Box key={item.id} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>
                          {item.donor_name || 'Anonymous'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(item.created_at).toLocaleDateString()}
                        </Typography>
                        <Typography variant="body2">Status: {item.status}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="text.secondary">
                          Amount: [Encrypted]
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {children}
      </Box>
    );
  }

  // If admin, show access request dialog
  if (isAdmin && !accessGranted) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <Lock style={{ height: 16, width: 16 }} />
          <AlertDescription>
            This financial data is protected. Admin access requires justification and will be audited.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Restricted Financial Data</CardTitle>
            <CardDescription>
              Administrative access to user financial information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Shield style={{ height: 16, width: 16, marginRight: 8 }} />
                  Request Admin Access
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Admin Financial Data Access</DialogTitle>
                </DialogHeader>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Alert>
                    <Shield style={{ height: 16, width: 16 }} />
                    <AlertDescription>
                      This action will be logged and audited. Provide a detailed justification for accessing this sensitive financial data.
                    </AlertDescription>
                  </Alert>

                  <Box>
                    <Label htmlFor="justification">Access Justification</Label>
                    <Textarea
                      id="justification"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Provide a detailed reason for accessing this financial data (minimum 20 characters required)..."
                      style={{ minHeight: '96px' }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <Button
                      variant="outline"
                      onClick={() => setShowAccessDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={requestFinancialAccess}
                      disabled={loading || justification.trim().length < 20}
                    >
                      {loading ? "Processing..." : "Request Access"}
                    </Button>
                  </Box>
                </Box>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // If admin with granted access, show the financial data
  if (isAdmin && accessGranted) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert>
          <Eye style={{ height: 16, width: 16 }} />
          <AlertDescription>
            Administrative access granted. This session is being monitored and logged.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield style={{ height: 20, width: 20 }} />
                Financial Data (Admin View)
              </Box>
            </CardTitle>
            <CardDescription>
              User financial information - access logged for audit
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                <Box sx={{ animation: 'spin 1s linear infinite', height: 24, width: 24, bgcolor: 'primary.main' }} />
              </Box>
            ) : financialData.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No financial data found for this user
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {financialData.map((item) => (
                  <Box key={item.id} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 500 }}>
                          {item.donor_name || 'Anonymous Donation'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(item.created_at).toLocaleDateString()}
                        </Typography>
                        <Typography variant="body2">Status: {item.status}</Typography>
                        {item.email && (
                          <Typography variant="body2">Email: {item.email}</Typography>
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="text.secondary">
                          Amount: [Encrypted - Admin View]
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        {children}
      </Box>
    );
  }

  // Default: Show locked state for non-admins
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert>
        <Lock style={{ height: 16, width: 16 }} />
        <AlertDescription>
          This financial information is private and protected.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Lock style={{ height: 20, width: 20 }} />
              Protected Financial Data
            </Box>
          </CardTitle>
          <CardDescription>
            Access to this information is restricted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Lock style={{ height: 48, width: 48, margin: '0 auto', marginBottom: 16, color: 'var(--muted-foreground)' }} />
            <Typography color="text.secondary">
              This financial data is protected and not accessible.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
