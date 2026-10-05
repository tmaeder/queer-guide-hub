import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareMenu } from '../ShareMenu';

const authState: { user: { id: string } | null } = { user: null };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

const dialogProps = vi.fn();
vi.mock('@/components/messaging/ShareEntityDialog', () => ({
  ShareEntityDialog: (props: { open: boolean; entity: { title: string } }) => {
    dialogProps(props);
    return props.open ? <div role="dialog">send {props.entity.title}</div> : null;
  },
}));

const entity = {
  entity_table: 'venues',
  entity_id: 'v1',
  title: 'Eagle Atlanta',
  path: '/venues/eagle-atlanta',
};

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /share/i }));
}

describe('ShareMenu in-app send', () => {
  beforeEach(() => {
    authState.user = null;
    dialogProps.mockClear();
  });

  it('offers "Send to member" to a signed-in user and opens the dialog with the entity', async () => {
    authState.user = { id: 'u1' };
    render(<ShareMenu url="https://queer.guide/venues/eagle-atlanta" entity={entity} />);
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: /send to member/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('send Eagle Atlanta');
  });

  it('hides the entry when signed out', async () => {
    render(<ShareMenu url="https://queer.guide/venues/eagle-atlanta" entity={entity} />);
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /send to member/i })).toBeNull();
    expect(dialogProps).not.toHaveBeenCalled();
  });

  it('hides the entry when no entity is given, even signed in', async () => {
    authState.user = { id: 'u1' };
    render(<ShareMenu url="https://queer.guide/x" />);
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /send to member/i })).toBeNull();
  });
});
