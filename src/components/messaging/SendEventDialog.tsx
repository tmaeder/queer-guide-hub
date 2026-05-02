import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Send, Check } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  fetchSendEventMembers,
  fetchSendEventGroups,
  postEventToGroup,
  type SendEventMemberOption as MemberOption,
  type SendEventGroupOption as GroupOption,
} from '@/hooks/useSendEventDialog';
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

  const [activeTab, setActiveTab] = useState<'member' | 'group'>('member');
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupOption | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setSelectedMember(null);
    setSelectedGroup(null);
    setNote('');
    setSearch('');
    setActiveTab('member');
    fetchMembers('');
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const fetchMembers = async (query: string) => {
    if (!user) return;
    setLoadingMembers(true);
    try {
      setMembers(await fetchSendEventMembers(user.id, query));
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchGroups = async () => {
    if (!user) return;
    setLoadingGroups(true);
    try {
      setGroups(await fetchSendEventGroups(user.id));
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchMembers(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const buildEventMessage = () => {
    const eventUrl = `${window.location.origin}${eventPath}`;
    const parts = [
      `📅 ${eventTitle}`,
      [eventDate, eventVenue].filter(Boolean).join(' · '),
      eventUrl,
    ];
    if (note.trim()) parts.push('', note.trim());
    return parts.join('\n');
  };

  const handleSend = async () => {
    if (!selectedMember || !user) return;
    setSending(true);
    try {
      const conversationId = await startConversation(selectedMember.id);
      if (!conversationId) throw new Error('Failed to create conversation');
      await sendMessage(conversationId, buildEventMessage());
      toast({ title: 'Sent', description: `Event sent to ${selectedMember.display_name || 'member'}` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to send event', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSendToGroup = async () => {
    if (!selectedGroup || !user) return;
    setSending(true);
    try {
      await postEventToGroup(selectedGroup.id, user.id, buildEventMessage());
      toast({ title: 'Posted', description: `Event shared to ${selectedGroup.name}` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to share event', variant: 'destructive' });
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

  const renderRow = (
    id: string,
    name: string | null,
    avatarUrl: string | null,
    selected: boolean,
    onSelect: () => void,
  ) => (
    <Box
      key={id}
      onClick={onSelect}
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
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {name || 'Anonymous'}
      </Typography>
      {selected && <Check style={{ width: 16, height: 16, color: 'hsl(var(--primary))' }} />}
    </Box>
  );

  const canSend = activeTab === 'member' ? !!selectedMember : !!selectedGroup;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Event</DialogTitle>
          <DialogDescription>Send this event to a member or post it to a group</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'member' | 'group')}>
          <TabsList style={{ width: '100%', marginTop: 8 }}>
            <TabsTrigger value="member" style={{ flex: 1 }}>Member</TabsTrigger>
            <TabsTrigger value="group" style={{ flex: 1 }}>Group</TabsTrigger>
          </TabsList>

          <TabsContent value="member">
            <Box sx={{ position: 'relative', mt: 1.5 }}>
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
            <ScrollArea style={{ height: 220, marginTop: 8 }}>
              {loadingMembers && members.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  Loading...
                </Typography>
              ) : members.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No members found
                </Typography>
              ) : (
                members.map((m) =>
                  renderRow(m.id, m.display_name, m.avatar_url, selectedMember?.id === m.id, () =>
                    setSelectedMember(selectedMember?.id === m.id ? null : m),
                  ),
                )
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="group">
            <ScrollArea style={{ height: 264, marginTop: 8 }}>
              {loadingGroups && groups.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  Loading...
                </Typography>
              ) : groups.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No groups joined yet
                </Typography>
              ) : (
                groups.map((g) =>
                  renderRow(g.id, g.name, g.image_url, selectedGroup?.id === g.id, () =>
                    setSelectedGroup(selectedGroup?.id === g.id ? null : g),
                  ),
                )
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {canSend && (
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
          <Button
            size="sm"
            onClick={activeTab === 'member' ? handleSend : handleSendToGroup}
            disabled={!canSend || sending}
          >
            <Send style={{ width: 14, height: 14, marginRight: 6 }} />
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
