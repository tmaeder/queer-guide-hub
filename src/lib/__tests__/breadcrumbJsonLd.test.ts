import { describe, it, expect } from 'vitest';
import { breadcrumbJsonLd } from '@/lib/breadcrumbJsonLd';

describe('breadcrumbJsonLd', () => {
  it('returns null for trails shorter than two named crumbs', () => {
    expect(breadcrumbJsonLd(null)).toBeNull();
    expect(breadcrumbJsonLd([{ label: 'Home', href: '/' }])).toBeNull();
  });

  it('builds a positioned BreadcrumbList with absolute item URLs', () => {
    const ld = breadcrumbJsonLd(
      [
        { label: 'Home', href: '/' },
        { label: 'Venues', href: '/venues' },
        { label: 'The Bar' },
      ],
      'https://queer.guide',
    );
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://queer.guide/' },
        { '@type': 'ListItem', position: 2, name: 'Venues', item: 'https://queer.guide/venues' },
        { '@type': 'ListItem', position: 3, name: 'The Bar' },
      ],
    });
  });

  it('skips non-string (React node) labels', () => {
    const ld = breadcrumbJsonLd([
      { label: 'Home', href: '/' },
      { label: 123 as never },
      { label: 'End' },
    ]);
    const positions = (ld?.itemListElement as Array<{ name: string }>).map((i) => i.name);
    expect(positions).toEqual(['Home', 'End']);
  });
});
