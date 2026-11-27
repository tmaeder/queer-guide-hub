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
  it('caps the rail at six and says how items were ranked', () => {
    related.data = Array.from({ length: 9 }, (_, i) => ({
      ...person(`p${i}`, `Person ${i}`),
      overlap: i === 0 ? 1 : 3,
    }));
    const { container, getByText } = renderWithProviders(
      <MoreLikeThisByTag entityType="personality" entityId="x" />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(6);
    expect(getByText(/Ranked by how many tags they share/)).toBeTruthy();
    // The test i18n instance does not interpolate; the count line is checked in the browser.
  });

  it('renders nothing below the minimum', () => {
    related.data = [person('a', 'Only One')];
    const { container } = renderWithProviders(
      <MoreLikeThisByTag entityType="personality" entityId="x" />,
    );
    expect(container.querySelector('section')).toBeNull();
  });

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

it('localizes country metadata and type labels on German personality discovery rails', async () => {
  const { createInstance } = await import('i18next');
  const { I18nextProvider } = await import('react-i18next');
  const de = (await import('@/i18n/locales/de.json')).default;
  const en = (await import('@/i18n/locales/en.json')).default;
  const i18n = createInstance();
  await i18n.init({
    lng: 'de',
    fallbackLng: 'en',
    resources: { de: { translation: de }, en: { translation: en } },
  });
  related.data = [
    person('a', 'First Person'),
    person('b', 'Second Person'),
    { ...person('c', 'Germany'), type: 'country', country: 'Germany' },
  ];
  const { container } = renderWithProviders(
    <I18nextProvider i18n={i18n}>
      <MoreLikeThisByTag entityType="personality" entityId="x" />
    </I18nextProvider>,
  );
  expect(container.textContent).toContain('Vereinigte Staaten');
  expect(container.textContent).toContain('Deutschland');
  expect(container.textContent).toContain('Land');
  expect(container.textContent).not.toContain('United States');
  expect(container.textContent).not.toContain('Germany');
});
