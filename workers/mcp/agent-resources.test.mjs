import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerQueerGuideAgentResources } from './agent-resources.mjs';

test('registers listable resources with self-contained readable contents and matching MIME types', async () => {
  const registered = [];
  const documents = [
    {
      name: 'guide',
      uri: 'queerguide://docs/guide',
      mimeType: 'text/markdown',
      description: 'When and how to use the platform.',
      text: '# Queer Guide\n\nUse the public read-only API for introductory pages.',
    },
    {
      name: 'schema',
      uri: 'queerguide://docs/openapi',
      mimeType: 'application/json',
      description: 'Public API schema.',
      text: '{"openapi":"3.1.0"}',
    },
  ];
  registerQueerGuideAgentResources({ resource: (...args) => registered.push(args) }, documents);
  assert.equal(registered.length, 2);
  for (const [index, registration] of registered.entries()) {
    const [name, uri, metadata, read] = registration;
    assert.equal(name, documents[index].name);
    assert.equal(uri, documents[index].uri);
    assert.deepEqual(metadata, {
      description: documents[index].description,
      mimeType: documents[index].mimeType,
    });
    const result = await read(new URL(uri));
    assert.deepEqual(result.contents, [
      { uri, mimeType: metadata.mimeType, text: documents[index].text },
    ]);
  }
});
