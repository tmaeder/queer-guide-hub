/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tag } from 'lucide-react';
import { ContentListGallery } from '../ContentListGallery';
import { ContentListBoard } from '../ContentListBoard';
import { groupableFields } from '../boardGrouping';
import type { ContentTypeConfig } from '@/types/cms';
import type { ListItem } from '../types';

/**
 * Gallery and Board are available for every registered type, so they must work
 * from the normalized ListItem alone — no per-type wiring.
 */

const config = {
  id: 'venues',
  tableName: 'venues',
  primaryKey: 'id',
  titleField: 'name',
  imageField: 'image_url',
  icon: Tag,
  label: { singular: 'Venue', plural: 'Venues' },
  color: 'hsl(0 0% 20%)',
  fields: [
    {
      name: 'category',
      label: 'Category',
      type: 'select',
      group: 'basic',
      options: [
        { value: 'bar', label: 'Bar' },
        { value: 'club', label: 'Club' },
      ],
    },
    { name: 'is_featured', label: 'Featured', type: 'boolean', group: 'basic' },
    { name: 'name', label: 'Name', type: 'text', group: 'basic' },
  ],
} as unknown as ContentTypeConfig;

const item = (over: Partial<ListItem> & { raw?: Record<string, unknown> } = {}): ListItem =>
  ({
    id: over.id ?? 'a',
    title: over.title ?? 'Berghain',
    description: over.description,
    contentType: 'venues',
    contentTypeLabel: 'Venue',
    contentTypeColor: 'hsl(0 0% 20%)',
    status: over.status,
    raw: over.raw ?? {},
  }) as ListItem;

describe('gallery view', () => {
  it('renders a card per record without per-type config', () => {
    render(
      <ContentListGallery
        items={[item({ id: 'a', title: 'Berghain' }), item({ id: 'b', title: 'LùBar' })]}
        loading={false}
        config={config}
        selected={new Set()}
        toggleSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Berghain')).toBeInTheDocument();
    expect(screen.getByText('LùBar')).toBeInTheDocument();
  });

  it('gives each card an accessible, keyboard-reachable edit control', () => {
    // A clickable div would be invisible to keyboard users and trip axe.
    render(
      <ContentListGallery
        items={[item({ title: 'Berghain' })]}
        loading={false}
        config={config}
        selected={new Set()}
        toggleSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Edit Berghain/i })).toBeInTheDocument();
  });

  it('falls back to an icon when the type has no image', () => {
    render(
      <ContentListGallery
        items={[item()]}
        loading={false}
        config={{ ...config, imageField: undefined }}
        selected={new Set()}
        toggleSelect={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('board view', () => {
  it('groups by the chosen column and labels from its options', () => {
    render(
      <ContentListBoard
        items={[
          item({ id: 'a', title: 'One', raw: { category: 'bar' } }),
          item({ id: 'b', title: 'Two', raw: { category: 'club' } }),
          item({ id: 'c', title: 'Three', raw: { category: 'bar' } }),
        ]}
        loading={false}
        config={config}
        groupBy="category"
        onEdit={vi.fn()}
      />,
    );
    // Option labels, not raw values.
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.getByText('Club')).toBeInTheDocument();
  });

  it('collects valueless records into one Ungrouped column, placed last', () => {
    render(
      <ContentListBoard
        items={[
          item({ id: 'a', title: 'One', raw: { category: 'bar' } }),
          item({ id: 'b', title: 'Two', raw: {} }),
        ]}
        loading={false}
        config={config}
        groupBy="category"
        onEdit={vi.fn()}
      />,
    );
    const headings = screen.getAllByText(/^(Bar|Ungrouped)$/).map((n) => n.textContent);
    expect(headings).toEqual(['Bar', 'Ungrouped']);
  });

  it('falls back to workflow status when no column is chosen', () => {
    render(
      <ContentListBoard
        items={[item({ id: 'a', title: 'One', status: 'published' })]}
        loading={false}
        config={config}
        groupBy={null}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('One')).toBeInTheDocument();
  });
});

describe('groupableFields', () => {
  it('offers only closed value sets', () => {
    // Grouping by free text would make one column per record.
    const names = groupableFields(config).map((f) => f.name);
    expect(names).toEqual(['category', 'is_featured']);
    expect(names).not.toContain('name');
  });

  it('is empty for a null config', () => {
    expect(groupableFields(null)).toEqual([]);
  });
});
