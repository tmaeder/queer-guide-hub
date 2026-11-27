import { useTranslation } from 'react-i18next';
import { BottomNavSheet } from '@/components/layout/bottom-nav/BottomNavSheet';
import { HubMenuBody } from './HubMenu';

interface MobileHubSheetProps {
  open: boolean;
  openedByPointer: boolean;
  onOpenChange: (open: boolean) => void;
  onDismissFocus: () => void;
}

/** The dock's Hub sheet. */
export function MobileHubSheet({
  open,
  openedByPointer,
  onOpenChange,
  onDismissFocus,
}: MobileHubSheetProps) {
  const { t } = useTranslation();
  const close = () => onOpenChange(false);

  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      hideTitle
      title={t('header.mobileNav.hub', 'Hub')}
      description={t(
        'header.mobileNav.hubDescription',
        'Your messages, plans, people and saved things.',
      )}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
    >
      <HubMenuBody besideClose onNavigate={close} />
    </BottomNavSheet>
  );
}
