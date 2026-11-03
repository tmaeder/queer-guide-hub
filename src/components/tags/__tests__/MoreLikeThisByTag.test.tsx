import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

const related = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('@/hooks/useRelatedByTags', () => ({
  useRelatedByTags: () => ({ data: related.data, isLoading: false }),
}));

import { MoreLikeThisByTag } from '../MoreLikeThisByTag';

const person = (id: string, title: string, image_url: string | null = null) => ({
  type: 'personality',
  id,
  slug: id,
  title,
  image_url,
  city: null,
  country: 'United States',
});

describe('MoreLikeThisByTag', () => {
  it('gives a person with no photo their initials, not stock art', () => {
    related.data = [
      person('a', 'Wendy Carlos'),
      person('b', 'Michail Kusmin'),
      person('c', 'Cole Porter', 'https://img.example/porter.jpg'),
    ];
    const { container, getAllByTestId } = renderWithProviders(
      <MoreLikeThisByTag entityType="personality" entityId="x" />,
    );
    expect(getAllByTestId('person-monogram').map((n) => n.textContent)).toEqual(['WC', 'MK', 'CP']);
    const imgs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('porter.jpg');
  });

  it('skips people the page already shows', () => {
    related.data = [
      person('a', 'Cole Porter'),
      person('b', 'Leonard Bernstein'),
      person('c', 'Michael Abels'),
      person('d', 'Billy Porter'),
      person('e', 'Wendy Carlos'),
    ];
    const { container } = renderWithProviders(
      <MoreLikeThisByTag
        entityType="personality"
        entityId="x"
        excludeKeys={['personality:a', 'personality:b']}
      />,
    );
    expect(container.textContent).not.toContain('Cole Porter');
    expect(container.textContent).not.toContain('Leonard Bernstein');
    expect(container.textContent).toContain('Michael Abels');
  });
});
