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
      <div className="flex flex-col gap-4">
        <Alert>
          <DollarSign className="h-4 w-4" />
          <AlertDescription>
            You're viewing your own financial data. This information is encrypted and protected.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Financial Data
              </div>
            </CardTitle>
            <CardDescription>
              Your donation history and financial transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 bg-primary animate-spin" />
              </div>
            ) : financialData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No financial data found
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {financialData.map((item) => (
                  <div key={item.id} className="p-4 border border-border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {item.donor_name || 'Anonymous'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-sm">Status: {item.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Amount: [Encrypted]
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {children}
      </div>
    );
  }

  // If admin, show access request dialog
  if (isAdmin && !accessGranted) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <Lock className="h-4 w-4" />
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
                  <Shield className="h-4 w-4 mr-2" />
                  Request Admin Access
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Admin Financial Data Access</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      This action will be logged and audited. Provide a detailed justification for accessing this sensitive financial data.
                    </AlertDescription>
                  </Alert>

                  <div>
                    <Label htmlFor="justification">Access Justification</Label>
                    <Textarea
                      id="justification"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Provide a detailed reason for accessing this financial data (minimum 20 characters required)..."
                      className="min-h-24"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
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
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If admin with granted access, show the financial data
  if (isAdmin && accessGranted) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            Administrative access granted. This session is being monitored and logged.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Financial Data (Admin View)
              </div>
            </CardTitle>
            <CardDescription>
              User financial information - access logged for audit
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 bg-primary animate-spin" />
              </div>
            ) : financialData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No financial data found for this user
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {financialData.map((item) => (
                  <div key={item.id} className="p-4 border border-border rounded-lg bg-muted">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {item.donor_name || 'Anonymous Donation'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-sm">Status: {item.status}</p>
                        {item.email && (
                          <p className="text-sm">Email: {item.email}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Amount: [Encrypted - Admin View]
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {children}
      </div>
    );
  }

  // Default: Show locked state for non-admins
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          This financial information is private and protected.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Protected Financial Data
            </div>
          </CardTitle>
          <CardDescription>
            Access to this information is restricted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              This financial data is protected and not accessible.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
