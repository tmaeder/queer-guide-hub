import type { ReactNode } from 'react';
import { HubNav } from '@/components/hub/HubNav';
import type { HubModuleId } from '@/config/hubModules';
import { useAuth } from '@/hooks/useAuth';
import { useInboxFeed } from '@/hooks/useInboxFeed';

/**
 * Office shell for /hub: persistent module nav (left sidebar on desktop,
 * horizontal scroller on mobile) + the active module's workspace. Modules are
 * registry-driven (src/config/hubModules.ts) — the shell never knows module
 * internals.
 */
export function HubShell({ active, children }: { active: HubModuleId; children: ReactNode }) {
  const { user } = useAuth();
  const { unreadCount } = useInboxFeed('all');

  return (
    <div className="flex min-w-0 flex-col gap-6" data-active-hub-module={active}>
      <HubNav activeModule={active} unreadCount={unreadCount} showUnread={!!user} showIdentity />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
