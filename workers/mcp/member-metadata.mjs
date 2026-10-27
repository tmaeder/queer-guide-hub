// One scope describes the existing signed-in capability. Do not advertise
// narrower permissions: the deployed service has no separate read/write grants.
// Keep self-contained because the recovery builder serializes this function.
export function queerGuideMemberMetadata(origin) {
  return {
    resource: `${origin}/authed`,
    resource_name: 'Queer Guide member MCP',
    authorization_servers: [origin],
    scopes_supported: ['member'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://queer.guide/docs',
  };
}
