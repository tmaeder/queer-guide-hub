/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableCell } from '@/components/ui/table';
import { AdminTableShell } from '../AdminTableShell';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
];

const rows = [
  { id: '1', name: 'Alice', role: 'admin' },
  { id: '2', name: 'Bob', role: 'editor' },
];

describe('AdminTableShell', () => {
  it('renders header cells from columns', () => {
    render(
      <AdminTableShell
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        renderRow={() => null}
      />,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  it('renders skeletons when loading', () => {
    const { container } = render(
      <AdminTableShell
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        renderRow={() => null}
        loading
      />,
    );
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('renders error message', () => {
    render(
      <AdminTableShell
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        renderRow={() => null}
        error="Bad RLS"
      />,
    );
    expect(screen.getByText('Bad RLS')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(
      <AdminTableShell
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        renderRow={() => null}
      />,
    );
    expect(screen.getByText(/No results/)).toBeInTheDocument();
  });

  it('renders one row per data item', () => {
    render(
      <AdminTableShell
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        renderRow={(r) => <><TableCell>{r.name}</TableCell><TableCell>{r.role}</TableCell></>}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(
      <AdminTableShell
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        renderRow={(r) => <TableCell>{r.name}</TableCell>}
        footer={<span>Page 1 of 5</span>}
      />,
    );
    expect(screen.getByText('Page 1 of 5')).toBeInTheDocument();
  });
});
