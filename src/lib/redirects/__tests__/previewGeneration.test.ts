import { beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { assertPublicHttpUrl } from '../../../../supabase/functions/_shared/ssrf-guard';
import { firecrawlScrape } from '../../../../supabase/functions/_shared/firecrawl';
const mocks = { completion: vi.fn() };
const source = readFileSync('supabase/functions/_shared/redirect-preview-generation.ts', 'utf8')
  .replace(/^import .*;\s*$/gm, '')
  .replace(/^export\s+/gm, '');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { previewDestination, previewDraft, generateRedirectPreview } = new Function(
  'assertPublicHttpUrl',
  'llmChatCompletion',
  'firecrawlScrape',
  code + '\nreturn {previewDestination,previewDraft,generateRedirectPreview};',
)(assertPublicHttpUrl, mocks.completion, firecrawlScrape) as {
  previewDestination: (target: string) => string;
  previewDraft: (content: string) => { title: string; description: string };
  generateRedirectPreview: (
    target: string,
    key: string,
    id: string,
  ) => Promise<{ title: string; description: string }>;
};
beforeEach(() => {
  vi.restoreAllMocks();
  mocks.completion.mockReset();
});
describe('preview generation', () => {
  it('rejects private destinations and credential URLs', () => {
    for (const target of [
      'http://127.0.0.1',
      'http://169.254.169.254',
      'http://[::ffff:127.0.0.1]',
      'https://localhost',
      'https://u:p@example.com',
      'javascript:alert(1)',
    ])
      expect(() => previewDestination(target)).toThrow();
    expect(previewDestination('/events#section')).toBe('https://queer.guide/events');
  });
  it('validates closed bounded output instead of trusting generated HTML', () => {
    expect(previewDraft('```json\n{"title":"Community","description":"Join us"}\n```')).toEqual({
      title: 'Community',
      description: 'Join us',
    });
    for (const value of [
      { title: '<script>', description: 'text' },
      { title: 'x'.repeat(121), description: 'text' },
      { title: 'Fine', description: '', image: 'https://example.com' },
      { title: 'Fine' },
    ])
      expect(() => previewDraft(JSON.stringify(value))).toThrow();
  });
  it('fetches only the fixed provider and bounds the untrusted prompt', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { markdown: 'page '.repeat(5000), metadata: { statusCode: 200 } },
        }),
      ),
    );
    mocks.completion.mockResolvedValue({
      content: '{"title":"Community","description":"Join us"}',
    });
    expect(await generateRedirectPreview('https://example.com', 'fixture-secret', 'link')).toEqual({
      title: 'Community',
      description: 'Join us',
    });
    expect(fetcher.mock.calls[0][0]).toBe('https://api.firecrawl.dev/v2/scrape');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
    const options = mocks.completion.mock.calls[0][0];
    expect(JSON.parse(options.messages[1].content).pageText).toHaveLength(16000);
    expect(options.retries).toBe(0);
    expect(options.max_tokens).toBe(300);
  });
  it('never calls AI after a failed or oversized content response', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(
      generateRedirectPreview('https://example.com', 'fixture', 'link'),
    ).rejects.toThrow();
    fetcher.mockResolvedValue(new Response('x'.repeat(512001)));
    await expect(generateRedirectPreview('https://example.com', 'fixture', 'link')).rejects.toThrow(
      'too large',
    );
    expect(mocks.completion).not.toHaveBeenCalled();
  });
});
