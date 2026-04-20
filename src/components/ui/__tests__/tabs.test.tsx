import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';

describe('Tabs', () => {
  it('fullWidth variant does not use scrollable scroller', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList variant="fullWidth">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A panel</TabsContent>
        <TabsContent value="b">B panel</TabsContent>
      </Tabs>,
    );
    expect(container.querySelector('.MuiTabs-scrollable')).toBeNull();
  });

  it('wires aria-controls / aria-labelledby between trigger and panel', () => {
    const { container, getByRole } = render(
      <Tabs defaultValue="a">
        <TabsList variant="fullWidth">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A panel</TabsContent>
      </Tabs>,
    );
    const trigger = container.querySelector('#tab-a');
    expect(trigger?.getAttribute('aria-controls')).toBe('tabpanel-a');
    const panel = getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-a');
    expect(panel.id).toBe('tabpanel-a');
  });

  it('only active panel rendered', () => {
    const { queryByText } = render(
      <Tabs defaultValue="a">
        <TabsList variant="fullWidth">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A panel</TabsContent>
        <TabsContent value="b">B panel</TabsContent>
      </Tabs>,
    );
    expect(queryByText('A panel')).toBeTruthy();
    expect(queryByText('B panel')).toBeNull();
  });
});
