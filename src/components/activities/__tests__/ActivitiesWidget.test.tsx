import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivitiesWidget } from '../ActivitiesWidget';
describe('ActivitiesWidget', () => {
  it('should render destination name', () => { render(<ActivitiesWidget destination="Berlin" />); expect(screen.getByText(/berlin/i)).toBeInTheDocument(); });
  it('should render tours heading', () => { render(<ActivitiesWidget destination="Zurich" />); expect(screen.getByText('Tours & Activities')).toBeInTheDocument(); });
  it('should render browse button', () => { render(<ActivitiesWidget destination="Test" />); expect(screen.getByRole('button')).toBeInTheDocument(); });
});
