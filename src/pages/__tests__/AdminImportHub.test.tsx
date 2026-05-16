/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import AdminImportHub from '../AdminImportHub';

describe('AdminImportHub', () => {
  it('redirects to /admin/pipelines', () => {
    render(
      <MemoryRouter initialEntries={['/admin/import-hub']}>
        <Routes>
          <Route path="/admin/import-hub" element={<AdminImportHub />} />
          <Route path="/admin/pipelines" element={<div data-testid="dest" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-testid="dest"]')).toBeInTheDocument();
  });
});
