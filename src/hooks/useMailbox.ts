import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type MailboxFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive';

export interface MailboxEmail {
  id: string;
  owner_id: string;
  direction: 'inbound' | 'outbound';
  from_address: string;
  from_name: string | null;
  to_address: string;
  to_name: string | null;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  attachments: any[];
  status: string;
  folder: MailboxFolder;
  is_read: boolean;
  is_starred: boolean;
  in_reply_to_email_id: string | null;
  thread_id: string | null;
  message_id_header: string | null;
  resend_id: string | null;
  resend_status: string | null;
  email_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const mailboxTable = () => supabase.from('mailbox_emails' as never);

export const useMailbox = () => {
  const [emails, setEmails] = useState<MailboxEmail[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<MailboxFolder>('inbox');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchEmails = useCallback(
    async (folder: MailboxFolder = selectedFolder, limit = 50) => {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await mailboxTable()
          .select('*')
          .eq('owner_id', user.id)
          .eq('folder', folder)
          .is('deleted_at', null)
          .order('email_date', { ascending: false })
          .limit(limit);

        if (error) throw error;
        setEmails((data as unknown as MailboxEmail[]) || []);
      } catch (err) {
        console.error('Error fetching emails:', err);
      } finally {
        setLoading(false);
      }
    },
    [user, selectedFolder],
  );

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { count, error } = await mailboxTable()
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('folder', 'inbox')
        .eq('is_read', false)
        .is('deleted_at', null);
      if (!error) setUnreadCount(count || 0);
    } catch {
      /* ignore count fetch failures */
    }
  }, [user]);

  const markRead = useCallback(
    async (emailId: string) => {
      if (!user) return;
      const { error } = await mailboxTable()
        .update({ is_read: true } as never)
        .eq('id', emailId)
        .eq('owner_id', user.id);
      if (!error) {
        setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, is_read: true } : e)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
    [user],
  );

  const toggleStar = useCallback(
    async (emailId: string) => {
      if (!user) return;
      const email = emails.find((e) => e.id === emailId);
      if (!email) return;
      const { error } = await mailboxTable()
        .update({ is_starred: !email.is_starred } as never)
        .eq('id', emailId)
        .eq('owner_id', user.id);
      if (!error) {
        setEmails((prev) =>
          prev.map((e) => (e.id === emailId ? { ...e, is_starred: !e.is_starred } : e)),
        );
      }
    },
    [user, emails],
  );

  const moveToFolder = useCallback(
    async (emailId: string, folder: MailboxFolder) => {
      if (!user) return;
      const { error } = await mailboxTable()
        .update({ folder } as never)
        .eq('id', emailId)
        .eq('owner_id', user.id);
      if (!error) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
      }
    },
    [user],
  );

  const deleteEmail = useCallback(
    async (emailId: string) => {
      if (!user) return;
      // Soft delete
      const { error } = await mailboxTable()
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', emailId)
        .eq('owner_id', user.id);
      if (!error) {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
      }
    },
    [user],
  );

  const sendEmail = useCallback(
    async (params: {
      to: string;
      subject: string;
      body_html?: string;
      body_text?: string;
      in_reply_to_email_id?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      setSending(true);
      try {
        const { data: result, error } = await supabase.functions.invoke('send-mailbox-email', {
          body: params,
        });
        if (error) throw new Error(error.message || 'Failed to send');
        toast({ title: 'Email sent', description: `To: ${params.to}` });
        return result;
      } catch (err: any) {
        toast({
          title: 'Failed to send email',
          description: err.message,
          variant: 'destructive',
        });
        throw err;
      } finally {
        setSending(false);
      }
    },
    [user, toast],
  );

  const saveDraft = useCallback(
    async (params: { to?: string; subject?: string; body_html?: string; body_text?: string }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('mailbox_address, display_name')
        .eq('user_id', user.id)
        .single();

      const fromAddress = profile?.mailbox_address
        ? `${profile.mailbox_address}@queer.guide`
        : user.email || '';

      const { error } = await mailboxTable().insert({
        owner_id: user.id,
        direction: 'outbound',
        from_address: fromAddress,
        from_name: profile?.display_name || null,
        to_address: params.to || '',
        subject: params.subject || '(no subject)',
        body_text: params.body_text || null,
        body_html: params.body_html || null,
        snippet: (params.body_text || '').slice(0, 200),
        status: 'draft',
        folder: 'drafts',
        is_read: true,
        email_date: new Date().toISOString(),
      } as never);

      if (!error) {
        toast({ title: 'Draft saved' });
      }
    },
    [user, toast],
  );

  // Fetch on folder change
  useEffect(() => {
    fetchEmails(selectedFolder);
  }, [selectedFolder, fetchEmails]);

  // Fetch unread count
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Real-time subscription for new inbound emails
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('mailbox-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mailbox_emails',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const newEmail = payload.new as unknown as MailboxEmail;
          if (newEmail.folder === selectedFolder) {
            setEmails((prev) => [newEmail, ...prev]);
          }
          if (
            newEmail.folder === 'inbox' &&
            !newEmail.is_read &&
            newEmail.direction === 'inbound'
          ) {
            setUnreadCount((prev) => prev + 1);
            toast({
              title: `New email from ${newEmail.from_name || newEmail.from_address}`,
              description: newEmail.subject,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedFolder, toast]);

  return {
    emails,
    selectedFolder,
    setSelectedFolder,
    unreadCount,
    loading,
    sending,
    fetchEmails,
    markRead,
    toggleStar,
    moveToFolder,
    deleteEmail,
    sendEmail,
    saveDraft,
  };
};
