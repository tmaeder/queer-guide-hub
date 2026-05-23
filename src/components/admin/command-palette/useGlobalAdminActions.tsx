/**
 * useGlobalAdminActions — registers "New <type>" Cmd-K actions for every
 * content type in the registry. Mounted once inside AdminShell so the
 * actions are available on every admin page.
 */

import { useMemo } from 'react';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import { useAdminShell } from '@/components/admin/shell/AdminShell';
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

  const actions: AdminCommandAction[] = useMemo(
    () =>
      Object.values(contentTypeRegistry).map((ct) => ({
        id: `create.${ct.id}`,
        label: `New ${ct.label.singular}`,
        keywords: `create new ${ct.label.singular} ${ct.label.plural}`,
        perform: () => openEditor(ct.id, null),
      })),
    [openEditor],
  );

  return (
    <>
      {actions.map((a) => (
        <NewEntityAction key={a.id} action={a} />
      ))}
    </>
  );
}
