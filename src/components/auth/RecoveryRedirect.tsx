import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

const RESET_PATH = '/auth/reset-password';

/**
 * Forwards an in-progress password recovery to the reset page from wherever
 * the link happened to land.
 *
 * This exists because the landing path is not ours to control: it is whatever
 * survives Supabase's redirect allowlist. When the allowlist does not contain
 * the URL we asked for, GoTrue silently falls back to Site URL and the
 * recovery session materializes on "/" — the exact shape of the original bug,
 * where the user was signed in by the link and then had nowhere to set a
 * password. Handling it here makes the flow correct regardless of dashboard
 * state, so a future allowlist edit cannot quietly break it again.
 *
 * Mounted app-wide (LayoutShell) rather than inside Auth so it sees every path.
 */
export function RecoveryRedirect() {
  const { passwordRecovery } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // One-shot. The recovery flag survives the whole tab session (it has to —
  // the reset page reads it after the landing URL is gone), so redirecting
  // on every render of it would trap the user: abandon the reset, and every
  // subsequent navigation yanks them back to the reset page with no way out.
  // Forwarding once delivers them to the form; after that they can browse.
  const forwarded = useRef(false);

  const shouldRedirect = passwordRecovery && location.pathname !== RESET_PATH;

  useEffect(() => {
    // The latch is read here rather than folded into shouldRedirect above:
    // a ref read during render is what react-hooks/refs flags, and it would
    // also make this component's output depend on a value React does not
    // track for re-rendering.
    if (!shouldRedirect || forwarded.current) return;
    forwarded.current = true;
    navigate(RESET_PATH, { replace: true });
  }, [shouldRedirect, navigate]);

  return null;
}
