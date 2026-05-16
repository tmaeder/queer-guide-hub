import { describe, it, expect } from 'vitest';
import { buildSubmissionSchema } from '../buildSubmissionSchema';

describe('buildSubmissionSchema', () => {
  it('returns a schema for an empty config', () => {
    const schema = buildSubmissionSchema({ fields: [], steps: [] } as never);
    expect(schema).toBeDefined();
  });
  it('returns a schema for fields config', () => {
    const schema = buildSubmissionSchema({
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'count', type: 'number' },
      ],
      steps: [{ id: 's1', fields: ['title', 'count'] }],
    } as never);
    expect(schema).toBeDefined();
  });
});
