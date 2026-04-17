import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, Trash2, Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  id: string;
  name: string;
  kind: 'slack' | 'discord' | 'generic_webhook';
  webhook_url: string;
  min_severity: 'info' | 'warn' | 'error';
  enabled: boolean;
  created_at: string;
  last_triggered_at: string | null;
  last_error: string | null;
  total_sent: number;
}

const KIND_LABEL: Record<string, string> = {
  slack: 'Slack',
  discord: 'Discord',
  generic_webhook: 'Generic webhook',
};

export default function IntegrationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<Integration>>({
    name: '', kind: 'slack', webhook_url: '', min_severity: 'warn', enabled: true,
  });

  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ['alert-integrations'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('alert_integrations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Integration[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await untypedFrom('alert_integrations').insert({
        name: form.name,
        kind: form.kind,
        webhook_url: form.webhook_url,
        min_severity: form.min_severity,
        enabled: form.enabled,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Integration added' });
      qc.invalidateQueries({ queryKey: ['alert-integrations'] });
      setDialogOpen(false);
      setForm({ name: '', kind: 'slack', webhook_url: '', min_severity: 'warn', enabled: true });
    },
    onError: (e: Error) => toast({ title: 'Create failed', description: e.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await untypedFrom('alert_integrations').update({ enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-integrations'] }),
    onError: (e: Error) => toast({ title: 'Toggle failed', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('alert_integrations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Integration removed' });
      qc.invalidateQueries({ queryKey: ['alert-integrations'] });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const sendTest = useMutation({
    mutationFn: async (i: Integration) => {
      const res = await fetch(i.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[TEST] ${i.name} — data ops alert integration test`,
        }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
    },
    onSuccess: (_, i) => toast({ title: 'Test message sent', description: i.name }),
    onError: (e: Error) => toast({ title: 'Test failed', description: e.message, variant: 'destructive' }),
  });

  const canSave = form.name && form.name.length >= 2 && form.webhook_url && form.webhook_url.startsWith('http');

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Alert Webhook Integrations</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{integrations.length}</Badge>
          <div className="flex-1" />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add integration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New webhook integration</DialogTitle>
                <DialogDescription>
                  Forward data ops alerts to Slack, Discord, or a custom endpoint.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Name</label>
                  <Input
                    value={form.name || ''}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. #data-ops alerts"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Type</label>
                  <Select value={form.kind || 'slack'} onValueChange={(v) => setForm({ ...form, kind: v as Integration['kind'] })}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slack">Slack</SelectItem>
                      <SelectItem value="discord">Discord</SelectItem>
                      <SelectItem value="generic_webhook">Generic webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Webhook URL</label>
                  <Input
                    value={form.webhook_url || ''}
                    onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="h-8 text-xs mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Minimum severity</label>
                  <Select
                    value={form.min_severity || 'warn'}
                    onValueChange={(v) => setForm({ ...form, min_severity: v as Integration['min_severity'] })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">info (all alerts)</SelectItem>
                      <SelectItem value="warn">warn and above</SelectItem>
                      <SelectItem value="error">error only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button size="sm" disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  Add integration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="border border-border rounded-md bg-background overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-xs">Loading…</div>
          ) : integrations.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Webhook className="h-5 w-5 mx-auto mb-2 opacity-40" />
              <p>No integrations configured</p>
              <p className="text-xs mt-1">Forward alerts to Slack, Discord, or any webhook endpoint.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  {['Name', 'Type', 'Min severity', 'URL', 'Sent', 'Last triggered', 'Enabled', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {integrations.map(i => (
                  <tr key={i.id} className={`border-b border-border/40 hover:bg-muted/30 transition-colors ${!i.enabled ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 font-medium">{i.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{KIND_LABEL[i.kind]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs capitalize">{i.min_severity}</td>
                    <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground truncate max-w-[280px]" title={i.webhook_url}>
                      {i.webhook_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/…
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs">{i.total_sent}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      {i.last_triggered_at ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              {i.last_error ? <XCircle className="h-3 w-3 text-destructive" /> : <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />}
                              {formatDistanceToNow(new Date(i.last_triggered_at), { addSuffix: true })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[300px]">
                            {i.last_error ? `Last error: ${i.last_error}` : 'Last send was successful'}
                          </TooltipContent>
                        </Tooltip>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={i.enabled}
                        onCheckedChange={(enabled) => toggle.mutate({ id: i.id, enabled })}
                      />
                    </td>
                    <td className="px-3 py-2 flex gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => sendTest.mutate(i)}
                            disabled={sendTest.isPending}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Send test message</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`Delete integration "${i.name}"?`)) remove.mutate(i.id);
                            }}
                            disabled={remove.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Delete</TooltipContent>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
