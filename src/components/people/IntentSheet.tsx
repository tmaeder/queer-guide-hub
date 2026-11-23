import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { StatusEditor } from '@/components/status/StatusEditor';

/**
 * People-hub entry point to the shared StatusEditor (vibe, mode, looking for,
 * travel). The editor is the same one behind "Set a vibe" and Settings; this
 * sheet only adds the chrome.
 */
export function IntentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-4 pb-8 sm:px-6">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>{t('people.intent.title', 'What are you here for?')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('people.intent.subtitle', 'Sets how we rank people for you. Change it anytime.')}
          </SheetDescription>
        </SheetHeader>
        <StatusEditor />
      </SheetContent>
    </Sheet>
  );
}
