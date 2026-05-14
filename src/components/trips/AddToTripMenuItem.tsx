import { useState } from 'react';
import { Luggage } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { AddToTripDialog, type AddToTripDialogProps } from './AddToTripDialog';

export interface AddToTripMenuItemProps {
  entity: AddToTripDialogProps['entity'];
  onClose?: () => void;
}

export function AddToTripMenuItem({ entity, onClose }: AddToTripMenuItemProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = () => {
    onClose?.();
    setDialogOpen(true);
  };

  return (
    <>
      <DropdownMenuItem onClick={handleClick} disabled={!user} className="gap-2">
        <Luggage style={{ width: 18, height: 18 }} />
        <span>{user ? 'Add to Trip' : 'Sign in to add to trip'}</span>
      </DropdownMenuItem>
      <AddToTripDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        entity={entity}
      />
    </>
  );
}
