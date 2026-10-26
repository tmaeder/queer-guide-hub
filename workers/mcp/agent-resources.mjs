/** Add permanent, readable resources independently of recommendation RPCs.
 * Uses the resource overload already provided by the deployed MCP SDK. */
export function registerQueerGuideAgentResources(server, documents) {
  for (const document of documents) {
    server.resource(
      document.name,
      document.uri,
      { description: document.description, mimeType: document.mimeType },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: document.mimeType, text: document.text }],
      }),
    );
  }
}
