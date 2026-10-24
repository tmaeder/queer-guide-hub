import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const adminState = {
  cached: false,
  canManageContent: false,
  ids: undefined as Record<string, string> | undefined,
};
const idCalls: Array<[string[], boolean]> = [];

vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ canManageContent: () => adminState.canManageContent, loading: false }),
}));
vi.mock('@/hooks/useCompetitions', () => ({
  useCompetitionIds: (slugs: string[], enabled: boolean) => {
    idCalls.push([slugs, enabled]);
    return { data: enabled || adminState.cached ? adminState.ids : undefined };
  },
}));
vi.mock('@/components/admin/AdminEditButton', () => ({
  AdminEditButton: (p: {
    contentType: string;
    contentId: string;
    contentName: string;
    exportable?: boolean;
  }) => (
    <div
      data-testid="admin-edit"
      data-type={p.contentType}
      data-id={p.contentId}
      data-name={p.contentName}
      data-exportable={String(Boolean(p.exportable))}
    />
  ),
}));

import { CompetitionAdminPanel } from '../CompetitionAdminPanel';
import type { Competition } from '@/types/competition';

const comp = (slug: string, name: string) => ({ slug, name }) as unknown as Competition;
const competitions = [comp('rpdr-us', 'RuPaul’s Drag Race'), comp('rpdr-uk', 'Drag Race UK')];

describe('CompetitionAdminPanel', () => {
  beforeEach(() => {
    adminState.canManageContent = false;
    adminState.ids = undefined;
    adminState.cached = false;
    idCalls.length = 0;
  });

  it('renders nothing and fetches nothing for a public visitor', () => {
    const { container } = render(<CompetitionAdminPanel competitions={competitions} />);
    expect(container).toBeEmptyDOMElement();
    expect(idCalls.every(([, enabled]) => enabled === false)).toBe(true);
  });

  it('hides the menus from a non-staff viewer even when ids are cached', () => {
    adminState.cached = true;
    adminState.ids = { 'rpdr-us': 'id-us', 'rpdr-uk': 'id-uk' };
    const { container } = render(<CompetitionAdminPanel competitions={competitions} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gives staff one exportable admin menu per competition', () => {
    adminState.canManageContent = true;
    adminState.ids = { 'rpdr-us': 'id-us', 'rpdr-uk': 'id-uk' };
    render(<CompetitionAdminPanel competitions={competitions} />);

    expect(idCalls.at(-1)).toEqual([['rpdr-us', 'rpdr-uk'], true]);
    const menus = screen.getAllByTestId('admin-edit');
    expect(menus.map((m) => [m.dataset.type, m.dataset.id, m.dataset.exportable])).toEqual([
      ['competitions', 'id-us', 'true'],
      ['competitions', 'id-uk', 'true'],
    ]);
    expect(menus[0].dataset.name).toBe('RuPaul’s Drag Race');
  });

  it('skips a competition whose id could not be resolved', () => {
    adminState.canManageContent = true;
    adminState.ids = { 'rpdr-us': 'id-us' };
    render(<CompetitionAdminPanel competitions={competitions} />);
    expect(screen.getAllByTestId('admin-edit')).toHaveLength(1);
  });

  it('waits for the ids before rendering', () => {
    adminState.canManageContent = true;
    const { container } = render(<CompetitionAdminPanel competitions={competitions} />);
    expect(container).toBeEmptyDOMElement();
  });
});
