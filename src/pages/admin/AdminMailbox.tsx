import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Send, Trash2, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Postfach — internal admin-to-admin messaging, ported from the PHP tool.
 * Separate from the user-facing /hub/messages DM system. Inbox / Sent / Drafts,
 * compose to another staff member, mark read, delete.
 */

interface AdminMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  body: string;
  thread_id: string | null;
  is_read: boolean;
  is_draft: boolean;
  created_at: string;
}

interface StaffUser {
  user_id: string;
  name: string;
}

type Tab = 'inbox' | 'sent' | 'drafts';

export default function AdminMailbox() {
  const { user } = useAuth();
  const uid = user?.id ?? '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('inbox');
  const [composeOpen, setComposeOpen] = useState(false);

  const key = ['admin-messages', uid];

  const { data: messages, isLoading } = useQuery({
    queryKey: key,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await untypedFrom('admin_messages')
        .select('id, sender_id, recipient_id, subject, body, thread_id, is_read, is_draft, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminMessage[];
    },
  });

  // Staff directory for the recipient picker (two-step: roles → profiles).
  const { data: staff } = useQuery({
    queryKey: ['admin-staff-directory'],
    queryFn: async () => {
      const { data: roles, error: rErr } = await untypedFrom('user_roles')
        .select('user_id, role')
        .in('role', ['admin', 'moderator', 'editor']);
      if (rErr) throw rErr;
      const ids = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
      if (ids.length === 0) return [] as StaffUser[];
      const { data: profiles, error: pErr } = await untypedFrom('profiles')
        .select('user_id, display_name, username')
        .in('user_id', ids);
      if (pErr) throw pErr;
      return (profiles ?? []).map(
        (p: { user_id: string; display_name: string | null; username: string | null }) => ({
          user_id: p.user_id,
          name: p.display_name || p.username || p.user_id.slice(0, 8),
        }),
      ) as StaffUser[];
    },
  });

  const nameOf = (id: string) =>
    staff?.find((s) => s.user_id === id)?.name ?? id.slice(0, 8);

  const filtered = useMemo(() => {
    const rows = messages ?? [];
    if (tab === 'inbox') return rows.filter((m) => m.recipient_id === uid && !m.is_draft);
    if (tab === 'sent') return rows.filter((m) => m.sender_id === uid && !m.is_draft);
    return rows.filter((m) => m.sender_id === uid && m.is_draft);
  }, [messages, tab, uid]);

  const unread = useMemo(
    () => (messages ?? []).filter((m) => m.recipient_id === uid && !m.is_read && !m.is_draft).length,
    [messages, uid],
  );

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('admin_messages').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('admin_messages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error('Could not delete message'),
  });

  const TabButton = ({ id, label, badge }: { id: Tab; label: string; badge?: number }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={
        'flex items-center gap-2 border-b-2 px-2 py-2 text-13 ' +
        (tab === id ? 'border-foreground font-semibold' : 'border-transparent text-muted-foreground')
      }
    >
      {label}
      {badge ? (
        <Badge variant="secondary" className="h-5 px-1.5 text-2xs">
          {badge}
        </Badge>
      ) : null}
    </button>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline flex items-center gap-2">
            <Mail size={22} /> Postfach
          </h1>
          <p className="text-13 text-muted-foreground">Internal staff messages.</p>
        </div>
        <ComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          staff={(staff ?? []).filter((s) => s.user_id !== uid)}
          senderId={uid}
          onSent={() => qc.invalidateQueries({ queryKey: key })}
        />
      </div>

      <div className="flex gap-1 border-b border-border">
        <TabButton id="inbox" label="Inbox" badge={unread} />
        <TabButton id="sent" label="Sent" />
        <TabButton id="drafts" label="Drafts" />
      </div>

      {isLoading ? (
        <p className="text-13 text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-13 text-muted-foreground">No messages.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((m) => {
            const other = tab === 'inbox' ? m.sender_id : m.recipient_id;
            const isUnread = tab === 'inbox' && !m.is_read;
            return (
              <li
                key={m.id}
                className={
                  'rounded-element border border-border p-2 ' + (isUnread ? 'bg-muted' : '')
                }
                onClick={() => isUnread && markRead.mutate(m.id)}
                onKeyDown={(e) => {
                  if (isUnread && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    markRead.mutate(m.id);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-13">
                      <span className="text-muted-foreground">
                        {tab === 'inbox' ? 'From' : 'To'}:{' '}
                      </span>
                      <span className="font-medium">{nameOf(other)}</span>
                      {isUnread && (
                        <Badge variant="secondary" className="ml-2 h-4 px-1 text-3xs">
                          new
                        </Badge>
                      )}
                    </p>
                    {m.subject && <p className="mt-0.5 text-13 font-semibold">{m.subject}</p>}
                    <p className="mt-1 whitespace-pre-wrap text-13 text-muted-foreground">
                      {m.body}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 p-0 text-destructive"
                    aria-label="Delete message"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove.mutate(m.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
  staff,
  senderId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staff: StaffUser[];
  senderId: string;
  onSent: () => void;
}) {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const send = useMutation({
    mutationFn: async (asDraft: boolean) => {
      if (!recipient || !body.trim()) throw new Error('Recipient and message are required.');
      const { error } = await untypedFrom('admin_messages').insert({
        sender_id: senderId,
        recipient_id: recipient,
        subject: subject.trim() || null,
        body: body.trim(),
        is_draft: asDraft,
      });
      if (error) throw error;
    },
    onSuccess: (_d, asDraft) => {
      toast.success(asDraft ? 'Draft saved' : 'Message sent');
      setRecipient('');
      setSubject('');
      setBody('');
      onOpenChange(false);
      onSent();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not send'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> New message
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Select value={recipient} onValueChange={setRecipient}>
            <SelectTrigger>
              <SelectValue placeholder="Recipient…" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.user_id} value={s.user_id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            rows={5}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={send.isPending || !recipient || !body.trim()}
            onClick={() => send.mutate(true)}
          >
            Save draft
          </Button>
          <Button
            size="sm"
            disabled={send.isPending || !recipient || !body.trim()}
            onClick={() => send.mutate(false)}
          >
            {send.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
