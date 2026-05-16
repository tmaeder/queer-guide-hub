import { describe, it, expect } from 'vitest';
import { buildSubmissionSchema } from '../buildSubmissionSchema';

describe('buildSubmissionSchema', () => {
  it('returns a schema for an empty config', () => {
    const schema = buildSubmissionSchema({ fields: [] } as never);
    expect(schema).toBeDefined();
  });
  it('returns a schema for fields config', () => {
    const schema = buildSubmissionSchema({
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'count', type: 'number' },
      ],
    } as never);
    expect(schema).toBeDefined();
  });
});
