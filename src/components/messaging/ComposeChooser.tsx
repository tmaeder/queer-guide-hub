import { useState } from 'react';
import { Plus, MessageCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

export function ComposeChooser({
  onNewMessage,
  onNewEmail,
}: {
  onNewMessage: () => void;
  onNewEmail: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label={t('inbox.compose.label', { defaultValue: 'Compose' })}>
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onNewMessage}>
          <MessageCircle className="mr-2 h-4 w-4" />
          {t('inbox.compose.message', { defaultValue: 'New message' })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNewEmail}>
          <Mail className="mr-2 h-4 w-4" />
          {t('inbox.compose.email', { defaultValue: 'New email' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
