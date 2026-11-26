import { useTranslation } from 'react-i18next';
import { BottomNavSheet } from '@/components/layout/bottom-nav/BottomNavSheet';
import { HubMenuBody } from './HubMenu';
import type { HubTabId } from './HubPanel';

interface MobileHubSheetProps {
  open: boolean;
  openedByPointer: boolean;
  onOpenChange: (open: boolean) => void;
  onDismissFocus: () => void;
  initialTab?: HubTabId;
}

/** The dock's Hub sheet. The Hub tab only opens this sheet, so Today is a tile here. */
export function MobileHubSheet({
  open,
  openedByPointer,
  onOpenChange,
  onDismissFocus,
  initialTab,
}: MobileHubSheetProps) {
  const { t } = useTranslation();
  const close = () => onOpenChange(false);

  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('header.mobileNav.hub', 'Hub')}
      description={t(
        'header.mobileNav.hubDescription',
        'Your messages, plans, people and saved things.',
      )}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
    >
      <HubMenuBody onNavigate={close} initialTab={initialTab} />
    </BottomNavSheet>
  );
}
