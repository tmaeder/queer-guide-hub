/**
 * Vendored verbatim from deepcrawl @ cb4817b
 *   apps/workers/v0/src/services/markdown/markdown-helpers.ts
 * MIT — see ./VENDORED.md
 */

/**
 * Processes multi-line links in markdown content by escaping newlines within link text.
 * This prevents the markdown parser from breaking links that span multiple lines.
 */
export function processMultiLineLinks(markdownContent: string): string {
  let insideLinkContent = false;
  let newMarkdownContent = '';
  let linkOpenCount = 0;

  for (let i = 0; i < markdownContent.length; i++) {
    const char = markdownContent[i];

    if (char === '[') {
      linkOpenCount++;
    } else if (char === ']') {
      linkOpenCount = Math.max(0, linkOpenCount - 1);
    }
    insideLinkContent = linkOpenCount > 0;

    if (insideLinkContent && char === '\n') {
      newMarkdownContent += '\\\n';
    } else {
      newMarkdownContent += char;
    }
  }
  return newMarkdownContent;
}

/**
 * Removes "Skip to Content" navigation-aid links from markdown content.
 */
export function removeSkipToContentLinks(markdownContent: string): string {
  return markdownContent.replace(/\[Skip to Content\]\(#[^)]*\)/gi, '');
}
