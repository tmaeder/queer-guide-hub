/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalPageLayout } from '../LegalPageLayout';

describe('LegalPageLayout', () => {
  it('renders', () => {
    render(
      <LegalPageLayout title="Terms" sections={[]}>
        <p>body</p>
      </LegalPageLayout>,
    );
    expect(screen.getByText('Terms')).toBeInTheDocument();
  });
});
