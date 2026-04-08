import { useState } from 'react';
import MuiMenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { Luggage } from 'lucide-react';
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
      <MuiMenuItem onClick={handleClick} disabled={!user}>
        <ListItemIcon>
          <Luggage style={{ width: 18, height: 18 }} />
        </ListItemIcon>
        <ListItemText>{user ? 'Add to Trip' : 'Sign in to add to trip'}</ListItemText>
      </MuiMenuItem>
      <AddToTripDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        entity={entity}
      />
    </>
  );
}
