import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';

interface CookieSettingsButtonProps {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function CookieSettingsButton({ 
  variant = 'outline', 
  size = 'sm',
  className = ''
}: CookieSettingsButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        variant={variant}
        size={size}
        className={`gap-2 ${className}`}
      >
        <Settings className="h-4 w-4" />
        Cookie Settings
      </Button>
      
      <CookiePreferencesDialog 
        open={showDialog} 
        onOpenChange={setShowDialog} 
      />
    </>
  );
}