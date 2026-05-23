import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAdminRoles } from '@/hooks/useAdminRoles';

interface AdminEditModeValue {
  /** True only when the current user can manage content (admin/moderator). */
  isAdmin: boolean;
  /** True while the Alt (Option) key is held — toggles edit affordance. */
  altHeld: boolean;
}

const AdminEditModeContext = createContext<AdminEditModeValue>({
  isAdmin: false,
  altHeld: false,
});

export function AdminEditModeProvider({ children }: { children: ReactNode }) {
  const { canManageContent, loading } = useAdminRoles();
  const isAdmin = !loading && canManageContent();
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isAdmin]);

  const value = useMemo(() => ({ isAdmin, altHeld }), [isAdmin, altHeld]);
  return (
    <AdminEditModeContext.Provider value={value}>{children}</AdminEditModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminEditMode(): AdminEditModeValue {
  return useContext(AdminEditModeContext);
}
