import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import Box from '@mui/material/Box';

interface CookieSettingsButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg';
}

export function CookieSettingsButton({
  variant = 'outline',
  size = 'sm'
}: CookieSettingsButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        variant={variant}
        size={size}
        style={{ display: 'inline-flex', gap: 8 }}
      >
        <Settings style={{ height: 16, width: 16 }} />
        Cookie Settings
      </Button>

      <CookiePreferencesDialog
        open={showDialog}
        onOpenChange={setShowDialog}
      />
    </>
  );
}
