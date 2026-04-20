export type PostType = 'text' | 'image' | 'link' | 'poll';

export interface PostDraft {
  content: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  pollOptions?: string[];
}

export interface ValidationPayload {
  data: Record<string, string>;
  fields: string[];
}

/**
 * Build the field set + payload for EnhancedContentValidator based on post
 * type. Only fields relevant to the type are included — prevents e.g. empty
 * pollOptions from failing a text post.
 */
export function buildPostValidationPayload(
  postType: PostType,
  draft: PostDraft,
): ValidationPayload {
  const data: Record<string, string> = { content: draft.content };
  const fields: string[] = ['content'];

  if (postType === 'link') {
    data.linkUrl = draft.linkUrl ?? '';
    data.linkTitle = draft.linkTitle ?? '';
    data.linkDescription = draft.linkDescription ?? '';
    fields.push('linkUrl', 'linkTitle', 'linkDescription');
  }

  if (postType === 'poll') {
    const nonEmpty = (draft.pollOptions ?? []).filter((o) => o.trim());
    data.pollOptions = nonEmpty.join('\n');
    fields.push('pollOptions');
  }

  return { data, fields };
}

export interface PreSubmitError {
  field: string;
  message: string;
}

export function preSubmitCheck(
  postType: PostType,
  draft: PostDraft,
): PreSubmitError | null {
  if (!draft.content.trim()) {
    return { field: 'content', message: 'Post content cannot be empty' };
  }
  if (postType === 'poll') {
    const nonEmpty = (draft.pollOptions ?? []).filter((o) => o.trim());
    if (nonEmpty.length < 2) {
      return { field: 'pollOptions', message: 'Poll needs at least 2 options' };
    }
  }
  if (postType === 'link' && draft.linkUrl) {
    try {
      const url = new URL(draft.linkUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { field: 'linkUrl', message: 'Only HTTP and HTTPS URLs are allowed' };
      }
    } catch {
      return { field: 'linkUrl', message: 'Please enter a valid URL' };
    }
  }
  return null;
}
