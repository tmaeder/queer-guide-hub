import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('boneyard-js/react', () => ({
  Skeleton: ({ children, loading, fixture }: any) => loading ? fixture : children,
}));

vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div>Loading...</div>,
}));

import { GroupCard } from '../GroupCard';

function makeGroup(overrides: Record<string, any> = {}) {
  return {
    id: 'g-1',
    name: 'Zurich Queers',
    description: 'Community group for LGBTQ+ folks in Zurich',
    image_url: null,
    is_private: false,
    member_count: 42,
    rules: null,
    created_by: 'u-1',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    tags: ['zurich', 'community'],
    user_role: undefined,
    is_member: false,
    ...overrides,
  };
}

describe('GroupCard', () => {
  it('should render group name', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup() as any} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Zurich Queers')).toBeInTheDocument();
  });

  it('should render member count', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup() as any} />
      </MemoryRouter>,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('members')).toBeInTheDocument();
  });

  it('should render description', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup() as any} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/community group/i)).toBeInTheDocument();
  });

  it('should render tags', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup() as any} />
      </MemoryRouter>,
    );
    expect(screen.getByText('zurich')).toBeInTheDocument();
    expect(screen.getByText('community')).toBeInTheDocument();
  });

  it('should show Join button when not a member', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup() as any} onJoin={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Join')).toBeInTheDocument();
  });

  it('should show Leave button when a member', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup({ is_member: true }) as any} onLeave={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Leave')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading', () => {
    render(
      <MemoryRouter>
        <GroupCard loading />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sample Group')).toBeInTheDocument();
  });

  it('should link to group detail page', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup() as any} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links.some(l => l.getAttribute('href') === '/groups/g-1')).toBe(true);
  });

  it('should show +N more for excess tags', () => {
    render(
      <MemoryRouter>
        <GroupCard group={makeGroup({ tags: ['a', 'b', 'c', 'd', 'e'] }) as any} />
      </MemoryRouter>,
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
