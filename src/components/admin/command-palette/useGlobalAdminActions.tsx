/**
 * useGlobalAdminActions — registers "New <type>" and "Quality: <type>" Cmd-K
 * actions for every content type in the registry. Mounted once inside
 * AdminShell so the actions are available on every admin page.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router';
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
  const navigate = useNavigate();

  const actions: AdminCommandAction[] = useMemo(() => {
    const types = Object.values(contentTypeRegistry);
    const create: AdminCommandAction[] = types
      // Only offer "New X" for content types the user may create.
      .filter((ct) => can('create', ct.id))
      .map((ct) => ({
        id: `create.${ct.id}`,
        label: `New ${ct.label.singular}`,
        keywords: `create new ${ct.label.singular} ${ct.label.plural}`,
        perform: () => openEditor(ct.id, null),
      }));
    // Registry-driven quality dashboards (deep-link-only routes, not in the nav).
    const quality: AdminCommandAction[] = types
      .filter((ct) => ct.admin?.qualityRoute)
      .map((ct) => ({
        id: `quality.${ct.id}`,
        label: `Quality: ${ct.label.plural}`,
        keywords: `quality review gate truth engine ${ct.label.plural}`,
        perform: () => navigate(ct.admin!.qualityRoute!),
      }));
    return [...create, ...quality];
  }, [openEditor, can, navigate]);

  return (
    <>
      {actions.map((a) => (
        <NewEntityAction key={a.id} action={a} />
      ))}
    </>
  );
}
