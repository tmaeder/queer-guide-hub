/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityPreviewCard } from '../EntityPreviewCard';

describe('EntityPreviewCard', () => {
  it('renders FallbackPreview when no entityData', () => {
    render(
      <EntityPreviewCard
        item={{ subtitle: 'sub line', meta: {}, entity_table: 'venues', content_type: 'venues' } as never}
        entityData={null}
      />,
    );
    expect(screen.getByText('sub line')).toBeInTheDocument();
  });

  it('renders meta fields as label/value rows', () => {
    render(
      <EntityPreviewCard
        item={{ subtitle: null, meta: { city_name: 'Berlin', is_open: true }, entity_table: 'venues', content_type: 'venues' } as never}
        entityData={null}
      />,
    );
    expect(screen.getByText('City Name')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Is Open')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it("shows 'No preview' when no subtitle and no meta", () => {
    render(
      <EntityPreviewCard
        item={{ subtitle: null, meta: null, entity_table: 'venues', content_type: 'venues' } as never}
        entityData={null}
      />,
    );
    expect(screen.getByText(/No preview available/)).toBeInTheDocument();
  });

  it('falls back to FallbackPreview for unknown entity types', () => {
    render(
      <EntityPreviewCard
        item={{ subtitle: 'foo', meta: {}, entity_table: 'weird_table', content_type: 'weird_table' } as never}
        entityData={{ name: 'X' } as never}
      />,
    );
    expect(screen.getByText('foo')).toBeInTheDocument();
  });
});
