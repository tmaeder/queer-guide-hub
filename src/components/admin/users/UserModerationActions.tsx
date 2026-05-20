import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { updateRowsBy } from '@/hooks/usePageFetchers';
import { toast } from 'sonner';
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
  approved: { label: 'Approved', color: 'hsl(var(--foreground))', variant: 'default' },
  suspended: { label: 'Suspended', color: 'hsl(var(--foreground) / 0.55)', variant: 'secondary' },
  banned: { label: 'Banned', color: 'hsl(var(--destructive))', variant: 'destructive' },
};

export function UserModerationActions({
  userId,
  currentStatus,
  displayName,
  onStatusChanged,
}: UserModerationActionsProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<ModerationStatus | null>(null);

  const handleAction = async () => {
    if (!pendingAction) return;
    if (pendingAction !== 'approved' && !reason.trim()) {
      toast.error('Reason required: Please provide a reason.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await updateRowsBy(
        'profiles',
        { col: 'user_id', val: userId },
        { moderation_status: pendingAction },
      );

      if (error) throw error;

      await supabase.rpc('log_security_event', {
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
    } catch (err: unknown) {
      toast.error(`Error: ${err}`);
    } finally {
      setLoading(false);
      setPendingAction(null);
      setReason('');
    }
  };

  const statusCfg = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.approved;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2">Current Status</p>
        <Badge variant={statusCfg.variant} style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
          {statusCfg.label}
        </Badge>
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-2">
          Reason (required for suspend/ban)
        </p>
        <Textarea
          placeholder="Describe the reason for this action..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ minHeight: 80 }}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'hsl(var(--foreground) / 0.55)' }}
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
      </div>

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
    </div>
  );
}
