/** Keep block-editor state in storage, never in a delivered email. */
export function stripEmailEditorMetadata(html: string): string {
  return html.replace(/<!--queer-guide-email-blocks:v1:[A-Za-z0-9+/=]+-->\s*/g, '');
}
