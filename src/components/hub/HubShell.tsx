import type { ReactNode } from 'react';
import { HubNavBar } from '@/components/hub/HubNavBar';
import type { HubModuleId } from '@/config/hubModules';
import { PageContainer } from '@/components/layout/PageContainer';

/**
 * Office shell for the HubPage-backed modules: the shared hub nav above the
 * active module's workspace. Modules are registry-driven
 * (src/config/hubModules.ts) — the shell never knows module internals.
 *
 * The nav is a SIBLING of the workspace container rather than a child, so this
 * shell places it exactly as every other /hub route does. `active` is kept only
 * as the `data-active-hub-module` marker the e2e specs read; HubNav derives the
 * highlighted pill from the pathname.
 */
export function HubShell({ active, children }: { active: HubModuleId; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" data-active-hub-module={active}>
      <HubNavBar />
      <PageContainer className="min-w-0">{children}</PageContainer>
    </div>
  );
}
