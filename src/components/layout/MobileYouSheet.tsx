import { useTranslation } from 'react-i18next';
import { BottomNavSheet } from '@/components/layout/bottom-nav/BottomNavSheet';
import { YouMenuBody } from '@/components/you/YouMenu';
import { useAuth } from '@/hooks/useAuth';
interface MobileYouSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openedByPointer?: boolean;
  onDismissFocus?: () => void;
}

/** The dock's "You" tab: the You menu in a sheet. */
export function MobileYouSheet({
  open,
  onOpenChange,
  openedByPointer,
  onDismissFocus,
}: MobileYouSheetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  return (
    <BottomNavSheet
      open={open}
      onOpenChange={onOpenChange}
      openedByPointer={openedByPointer}
      onDismissFocus={onDismissFocus}
      hideTitle
      title={t('header.userMenu.you', 'You')}
    >
      {/* Back shares the close button's row, so the box gets 85dvh minus
          1rem top, the 2.75rem row, 0.5rem gap and 1.5rem bottom. */}
      <YouMenuBody
        besideClose
        onNavigate={() => onOpenChange(false)}
        editorHeight="max-h-[calc(85dvh-5.75rem)]"
      />
    </BottomNavSheet>
  );
}
