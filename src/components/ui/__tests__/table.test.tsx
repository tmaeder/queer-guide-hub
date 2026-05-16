/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '../table';

describe('Table', () => {
  it('renders', () => {
    render(
      <Table>
        <TableHeader><TableRow><TableHead>A</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>v</TableCell></TableRow></TableBody>
      </Table>,
    );
    expect(screen.getByText('v')).toBeInTheDocument();
  });
});
