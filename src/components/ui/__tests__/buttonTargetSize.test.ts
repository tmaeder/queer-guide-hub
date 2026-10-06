import { describe, expect, it } from 'vitest';
import { buttonVariants } from '../button';

describe('button target sizes', () => {
  it.each(['default', 'sm', 'lg', 'icon'] as const)(
    '%s never renders below the 44px target baseline',
    (size) => {
      const classes = buttonVariants({ size });
      expect(classes).toContain('min-h-11');
      if (size === 'icon') expect(classes).toContain('w-11');
    },
  );
});
