import { useNavigate } from 'react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdultAcknowledgement } from '@/hooks/useAdultContent';

interface AdultContentGateProps {
  /** When true, the gate considers itself relevant for this page. */
  active: boolean;
  /** Where to send the visitor if they decline. Defaults to `/`. */
  fallbackPath?: string;
}

/**
 * Shows an 18+ acknowledgement dialog when `active` and the visitor has
 * not yet confirmed. Confirmation persists in localStorage across
 * navigation. Declining navigates away from the gated route.
 */
export function AdultContentGate({ active, fallbackPath = '/' }: AdultContentGateProps) {
  const { acknowledged, acknowledge } = useAdultAcknowledgement();
  const navigate = useNavigate();

  const open = active && !acknowledged;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Adult content ahead</AlertDialogTitle>
          <AlertDialogDescription>
            This page lists products and imagery intended for adults. Please confirm you are 18 or
            older to continue. Your choice is remembered on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => navigate(fallbackPath)}>Take me back</AlertDialogCancel>
          <AlertDialogAction onClick={() => acknowledge()}>I am 18 or older</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
