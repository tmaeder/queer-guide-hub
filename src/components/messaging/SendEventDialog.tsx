import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Send, Check } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { supabase } from '@/integrations/supabase/client';
import { useMessaging } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface SendEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  eventDate: string;
  eventVenue?: string;
  eventPath: string;
}

interface MemberOption {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function SendEventDialog({
  open,
  onOpenChange,
  eventTitle,
  eventDate,
  eventVenue,
  eventPath,
}: SendEventDialogProps) {
  const { user } = useAuth();
  const { startConversation, sendMessage } = useMessaging();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setSelectedMember(null);
    setNote('');
    setSearch('');
    fetchMembers('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMembers defined below, re-run on open/user change
  }, [open, user]);

  const fetchMembers = async (query: string) => {
    if (!user) return;
    setLoadingMembers(true);
    try {
      let q = supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .neq('user_id', user.id)
        .order('display_name')
        .limit(30);

      if (query.trim()) {
        q = q.ilike('display_name', `%${query.trim()}%`);
      }

      const { data } = await q;
      setMembers(
        (data || []).map((p) => ({
          id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        })),
      );
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchMembers(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMembers defined above, re-run on search/open change
  }, [search, open]);

  const handleSend = async () => {
    if (!selectedMember || !user) return;
    setSending(true);
    try {
      const conversationId = await startConversation(selectedMember.id);
      if (!conversationId) throw new Error('Failed to create conversation');

      const eventUrl = `${window.location.origin}${eventPath}`;
      const parts = [
        `📅 ${eventTitle}`,
        [eventDate, eventVenue].filter(Boolean).join(' · '),
        eventUrl,
      ];
      if (note.trim()) parts.push('', note.trim());

      await sendMessage(conversationId, parts.join('\n'));

      toast({ title: 'Sent', description: `Event sent to ${selectedMember.display_name || 'member'}` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to send event', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const initials = (name: string | null) =>
    (name || '?')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to Member</DialogTitle>
          <DialogDescription>Share this event with a member via DM</DialogDescription>
        </DialogHeader>

        <Box sx={{ position: 'relative', mt: 2 }}>
          <Search
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: 'hsl(var(--muted-foreground))',
            }}
          />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </Box>

        <ScrollArea style={{ height: 240, marginTop: 8 }}>
          {loadingMembers && members.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Loading...
            </Typography>
          ) : members.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No members found
            </Typography>
          ) : (
            members.map((member) => {
              const selected = selectedMember?.id === member.id;
              return (
                <Box
                  key={member.id}
                  onClick={() => setSelectedMember(selected ? null : member)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: selected ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Avatar style={{ width: 36, height: 36 }}>
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback>{initials(member.display_name)}</AvatarFallback>
                  </Avatar>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {member.display_name || 'Anonymous'}
                  </Typography>
                  {selected && <Check style={{ width: 16, height: 16, color: 'hsl(var(--primary))' }} />}
                </Box>
              );
            })
          )}
        </ScrollArea>

        {selectedMember && (
          <Input
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSend} disabled={!selectedMember || sending}>
            <Send style={{ width: 14, height: 14, marginRight: 6 }} />
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
