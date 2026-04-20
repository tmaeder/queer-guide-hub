import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { photos: [] }, error: null }) } },
}));

import CountryHeroImages from '../CountryHeroImages';

describe('CountryHeroImages', () => {
  it('should render without crashing', () => {
    render(
      <CountryHeroImages country={{ id: 'x', name: 'Switzerland' }} />,
    );
    expect(document.body).toBeTruthy();
  });
});
