/**
 * useGlobalAdminActions — registers "New <type>" Cmd-K actions for every
 * content type in the registry. Mounted once inside AdminShell so the
 * actions are available on every admin page.
 */

import { useMemo } from 'react';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { useAdminShell } from '@/components/admin/shell/AdminShell';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import {
  useRegisterAdminCommandAction,
  type AdminCommandAction,
} from './useAdminCommandActions';

/**
 * Stable child component: one mount, registers one action.
 * Hooks-in-loop is forbidden, so we render a child per content type.
 */
function NewEntityAction({ action }: { action: AdminCommandAction }) {
  useRegisterAdminCommandAction(action);
  return null;
}

export function GlobalAdminActions() {
  const { openEditor } = useAdminShell();
  const { can } = useGranularRoles();

  const actions: AdminCommandAction[] = useMemo(
    () =>
      Object.values(contentTypeRegistry)
        // Only offer "New X" for content types the user may create.
        .filter((ct) => can('create', ct.id))
        .map((ct) => ({
          id: `create.${ct.id}`,
          label: `New ${ct.label.singular}`,
          keywords: `create new ${ct.label.singular} ${ct.label.plural}`,
          perform: () => openEditor(ct.id, null),
        })),
    [openEditor, can],
  );

  return (
    <>
      {actions.map((a) => (
        <NewEntityAction key={a.id} action={a} />
      ))}
    </>
  );
}
