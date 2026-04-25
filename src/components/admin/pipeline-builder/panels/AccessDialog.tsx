import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Trash2, Loader2, Shield, Eye, Pencil, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useToast } from '@/hooks/use-toast';

interface Grant {
  id: string;
  pipeline_id: string;
  user_id: string;
  permission: 'view' | 'edit' | 'run';
  granted_by: string | null;
  granted_at: string;
}

interface AccessDialogProps {
  pipelineId: string | undefined;
  pipelineName: string;
}

const PERM_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
  view: { icon: Eye, label: 'View', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  run: { icon: Play, label: 'Run', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  edit: { icon: Pencil, label: 'Edit', className: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
};

export default function AccessDialog({ pipelineId, pipelineName }: AccessDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [perm, setPerm] = useState<'view' | 'edit' | 'run'>('view');
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ['pipeline-permissions', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      const { data, error } = await untypedFrom('pipeline_permissions')
        .select('id, pipeline_id, user_id, permission, granted_by, granted_at')
        .eq('pipeline_id', pipelineId)
        .order('granted_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Grant[];
    },
    enabled: open && !!pipelineId,
  });

  const addGrant = useMutation({
    mutationFn: async () => {
      if (!pipelineId) throw new Error('No pipeline selected');

      // Resolve email to user_id. Direct query on auth.users isn't exposed to clients,
      // so rely on a public profiles table with email column.
      const { data: profile, error: profErr } = await untypedFrom('profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
      if (profErr) throw profErr;
      if (!profile) throw new Error(`No user found with email ${email}`);

      const { data: u } = await supabase.auth.getUser();
      const { error } = await untypedFrom('pipeline_permissions').insert({
        pipeline_id: pipelineId,
        user_id: (profile as unknown as { id: string }).id,
        permission: perm,
        granted_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Access granted' });
      qc.invalidateQueries({ queryKey: ['pipeline-permissions', pipelineId] });
      setEmail('');
    },
    onError: (e: Error) => toast({ title: 'Grant failed', description: e.message, variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('pipeline_permissions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-permissions', pipelineId] });
    },
    onError: (e: Error) => toast({ title: 'Revoke failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={!pipelineId}>
                <Users className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Manage access</TooltipContent>
        </Tooltip>

        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Access — {pipelineName || 'pipeline'}
            </DialogTitle>
            <DialogDescription>
              Grant view / run / edit permissions to specific users. Admins always have full access.
              View permission is implied by run or edit.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="access-dialog-email" className="text-xs font-medium">User email</label>
              <Input
                id="access-dialog-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alice@example.com"
                className="h-8 text-xs mt-1"
                type="email"
              />
            </div>
            <div className="w-28">
              <label htmlFor="access-dialog-perm" className="text-xs font-medium">Permission</label>
              <Select value={perm} onValueChange={(v) => setPerm(v as 'view' | 'edit' | 'run')}>
                <SelectTrigger id="access-dialog-perm" aria-label="Permission" className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="run">Run</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-8" onClick={() => addGrant.mutate()} disabled={!email || addGrant.isPending}>
              {addGrant.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <div className="border border-border rounded-md bg-background overflow-hidden max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground text-xs">Loading…</div>
            ) : grants.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Users className="h-5 w-5 mx-auto mb-2 opacity-40" />
                No explicit grants — only admins have access.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {grants.map(g => {
                  const pc = PERM_CONFIG[g.permission];
                  const PIcon = pc.icon;
                  return (
                    <div key={g.id} className="p-2.5 flex items-center gap-2 hover:bg-muted/30 transition-colors">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${pc.className}`}>
                        <PIcon className="h-2.5 w-2.5" />
                        {pc.label}
                      </Badge>
                      <code className="text-[11px] font-mono flex-1 truncate" title={g.user_id}>
                        {g.user_id.slice(0, 16)}
                      </code>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(g.granted_at), { addSuffix: true })}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => revoke.mutate(g.id)}
                        disabled={revoke.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
