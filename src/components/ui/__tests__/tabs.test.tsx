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
    const { getByRole } = render(
      <Tabs defaultValue="a">
        <TabsList variant="fullWidth">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A panel</TabsContent>
      </Tabs>,
    );
    const trigger = getByRole('tab');
    const panel = getByRole('tabpanel');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id);
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
