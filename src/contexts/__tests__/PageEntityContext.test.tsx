/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PageEntityProvider,
  usePageEntity,
  usePageEntityState,
  type PageEntity,
} from '../PageEntityContext';

function Publisher({ entity }: { entity: PageEntity }) {
  usePageEntity(entity);
  return null;
}

function Reader() {
  const entity = usePageEntityState();
  return (
    <output>
      {entity ? `${entity.contentType}:${entity.contentId}:${entity.contentName}` : 'none'}
    </output>
  );
}

describe('PageEntityContext', () => {
  it('publishes the current entity and clears it when the page unmounts', () => {
    const entity = { contentType: 'venues', contentId: 'v1', contentName: 'The Place' };
    const { rerender } = render(
      <PageEntityProvider>
        <Publisher entity={entity} />
        <Reader />
      </PageEntityProvider>,
    );

    expect(screen.getByText('venues:v1:The Place')).toBeTruthy();

    rerender(
      <PageEntityProvider>
        <Reader />
      </PageEntityProvider>,
    );
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('is safe outside a provider', () => {
    expect(() =>
      render(<Publisher entity={{ contentType: 'events', contentId: 'e1' }} />),
    ).not.toThrow();
  });
});
