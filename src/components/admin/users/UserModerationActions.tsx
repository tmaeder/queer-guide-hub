import { useState } from 'react';
import { api } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ShieldCheck, ShieldBan, ShieldAlert } from 'lucide-react';

type ModerationStatus = 'approved' | 'suspended' | 'banned';

interface UserModerationActionsProps {
  userId: string;
  currentStatus: ModerationStatus;
  displayName: string;
  onStatusChanged: () => void;
}

const STATUS_CONFIG: Record<
  ModerationStatus,
  { label: string; color: string; variant: 'default' | 'secondary' | 'destructive' }
> = {
  approved: { label: 'Approved', color: '#22c55e', variant: 'default' },
  suspended: { label: 'Suspended', color: '#eab308', variant: 'secondary' },
  banned: { label: 'Banned', color: '#ef4444', variant: 'destructive' },
};

export function UserModerationActions({
  userId,
  currentStatus,
  displayName,
  onStatusChanged,
}: UserModerationActionsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<ModerationStatus | null>(null);

  const handleAction = async () => {
    if (!pendingAction) return;
    if (pendingAction !== 'approved' && !reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a reason.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({ moderation_status: pendingAction } as any)
        .eq('user_id', userId);

      if (error) throw error;

      await api.rpc('log_security_event', {
        p_event_type: `USER_${pendingAction.toUpperCase()}`,
        p_user_id: null,
        p_metadata: {
          target_user_id: userId,
          previous_status: currentStatus,
          new_status: pendingAction,
          reason: reason.trim() || undefined,
        },
        p_severity: pendingAction === 'banned' ? 'high' : 'medium',
      });

      toast({ title: 'Status updated', description: `User has been ${pendingAction}.` });
      onStatusChanged();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setPendingAction(null);
      setReason('');
    }
  };

  const statusCfg = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.approved;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Current Status
        </Typography>
        <Badge variant={statusCfg.variant} style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {statusCfg.label}
        </Badge>
      </Box>

      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Reason (required for suspend/ban)
        </Typography>
        <Textarea
          placeholder="Describe the reason for this action..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ minHeight: 80 }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {currentStatus !== 'approved' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPendingAction('approved')}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ShieldCheck style={{ height: 14, width: 14 }} />
            Reinstate
          </Button>
        )}
        {currentStatus !== 'suspended' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPendingAction('suspended')}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#eab308' }}
          >
            <ShieldAlert style={{ height: 14, width: 14 }} />
            Suspend
          </Button>
        )}
        {currentStatus !== 'banned' && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingAction('banned')}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ShieldBan style={{ height: 14, width: 14 }} />
            Ban
          </Button>
        )}
      </Box>

      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === 'approved'
                ? 'Reinstate'
                : pendingAction === 'suspended'
                  ? 'Suspend'
                  : 'Ban'}{' '}
              User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {pendingAction === 'approved' ? 'reinstate' : pendingAction}{' '}
              "{displayName}"?
              {pendingAction === 'banned' &&
                ' This will prevent the user from accessing the platform.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={loading}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
