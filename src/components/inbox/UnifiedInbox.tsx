import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Mail,
  Inbox as InboxIcon,
  Send,
  FileText,
  Trash2,
  Archive,
  Search,
  PenSquare,
  Bell,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { useUnifiedInbox, type InboxItemType } from '@/hooks/useUnifiedInbox';
import { useMailboxAddress } from '@/hooks/useMailboxAddress';
import { useAuth } from '@/hooks/useAuth';
import { type MailboxFolder } from '@/hooks/useMailbox';
import { EmailView } from './EmailView';
import { ComposeEmail } from './ComposeEmail';
import { MailboxSettings } from './MailboxSettings';
import { InboxItemList } from './InboxItemList';

const FOLDERS: { key: MailboxFolder; label: string; icon: React.ElementType }[] = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'archive', label: 'Archive', icon: Archive },
  { key: 'trash', label: 'Trash', icon: Trash2 },
];

const TYPE_FILTERS: { key: InboxItemType | 'all'; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'All', icon: InboxIcon },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'notification', label: 'Alerts', icon: Bell },
];

export const UnifiedInbox: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEmailId = searchParams.get('email');
  const showCompose = searchParams.get('compose') === 'true';
  const showSettings = searchParams.get('settings') === 'true';

  const [typeFilter, setTypeFilter] = useState<InboxItemType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { items, totalUnread, mailbox, loading } = useUnifiedInbox(typeFilter);
  const { currentAddress } = useMailboxAddress();

  // For non-inbox folders, only show emails (notifications only appear in inbox)
  const folderItems =
    mailbox.selectedFolder !== 'inbox' ? items.filter((i) => i.type === 'email') : items;

  const filteredItems = searchQuery
    ? folderItems.filter(
        (i) =>
          i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
          i.snippet.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : folderItems;

  const selectEmail = (id: string) => {
    setSearchParams({ email: id });
    // Mark as read
    const item = items.find((i) => i.id === id);
    if (item && !item.isRead && item.type === 'email') {
      mailbox.markRead(id);
    }
  };

  const clearSelection = () => {
    setSearchParams({});
  };

  const openCompose = () => setSearchParams({ compose: 'true' });
  const closeCompose = () => setSearchParams({});
  const openSettings = () => setSearchParams({ settings: 'true' });
  const closeSettings = () => setSearchParams({});

  if (!user) {
    return (
      <Container sx={{ py: 4 }}>
        <Typography>Please sign in to access your inbox.</Typography>
      </Container>
    );
  }

  // Settings view
  if (showSettings) {
    return (
      <Container sx={{ py: 4 }}>
        <Button variant="ghost" onClick={closeSettings} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <MailboxSettings />
      </Container>
    );
  }

  // Compose view
  if (showCompose) {
    return (
      <Container sx={{ py: 4 }}>
        <Button variant="ghost" onClick={closeCompose} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <ComposeEmail onSent={closeCompose} onCancel={closeCompose} />
      </Container>
    );
  }

  // Email detail view (mobile-first: replaces list)
  if (selectedEmailId) {
    const selectedItem = items.find((i) => i.id === selectedEmailId);
    return (
      <Container sx={{ py: 4 }}>
        <Button variant="ghost" onClick={clearSelection} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {selectedItem?.type === 'email' ? (
          <EmailView
            email={selectedItem.raw}
            onReply={(email) => setSearchParams({ compose: 'true', replyTo: email.id })}
            onDelete={(id) => {
              mailbox.moveToFolder(id, 'trash');
              clearSelection();
            }}
            onArchive={(id) => {
              mailbox.moveToFolder(id, 'archive');
              clearSelection();
            }}
          />
        ) : (
          <Card className="p-6">
            <Typography variant="h6">{selectedItem?.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {selectedItem?.snippet}
            </Typography>
          </Card>
        )}
      </Container>
    );
  }

  // Main inbox list view
  return (
    <Container sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            <Mail
              style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}
              size={24}
            />
            Inbox
          </Typography>
          {currentAddress && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {currentAddress}@queer.guide
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!currentAddress && (
            <Button variant="outline" size="sm" onClick={openSettings}>
              Claim Email Address
            </Button>
          )}
          {currentAddress && (
            <Button size="sm" onClick={openCompose}>
              <PenSquare className="h-4 w-4 mr-1" /> Compose
            </Button>
          )}
        </Box>
      </Box>

      {/* Folder tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        {FOLDERS.map((f) => (
          <Button
            key={f.key}
            variant={mailbox.selectedFolder === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => mailbox.setSelectedFolder(f.key)}
          >
            <f.icon className="h-3.5 w-3.5 mr-1" />
            {f.label}
            {f.key === 'inbox' && totalUnread > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {totalUnread}
              </Badge>
            )}
          </Button>
        ))}
      </Box>

      {/* Type filter (inbox folder only) */}
      {mailbox.selectedFolder === 'inbox' && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
          {TYPE_FILTERS.map((t) => (
            <Button
              key={t.key}
              variant={typeFilter === t.key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter(t.key)}
            >
              <t.icon className="h-3.5 w-3.5 mr-1" />
              {t.label}
            </Button>
          ))}
        </Box>
      )}

      {/* Search */}
      <Box sx={{ position: 'relative', mb: 2 }}>
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
          size={16}
        />
        <Input
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </Box>

      {/* Email list */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Box>
      ) : filteredItems.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
          <Typography color="text.secondary">
            {searchQuery ? 'No results found' : 'No emails in this folder'}
          </Typography>
        </Box>
      ) : (
        <InboxItemList
          items={filteredItems}
          onSelect={selectEmail}
          onToggleStar={(id) => mailbox.toggleStar(id)}
        />
      )}
    </Container>
  );
};
