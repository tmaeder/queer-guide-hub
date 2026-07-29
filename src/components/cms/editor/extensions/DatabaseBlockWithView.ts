import { ReactNodeViewRenderer } from '@tiptap/react';
import { DatabaseBlock } from './DatabaseBlock';
import { DatabaseBlockNodeView } from './DatabaseBlockNodeView';

/**
 * The editor-facing node: the pure `DatabaseBlock` schema plus a React NodeView.
 *
 * Kept separate so `DatabaseBlock.ts` stays free of React, the layout tree and
 * the Supabase client. That matters because the schema, its HTML round-trip and
 * the document walker are exercised in isolation — and because the public page
 * renders stored HTML rather than mounting an editor, so nothing on a reader's
 * path should be able to reach the nodeview by importing the node.
 */
export const DatabaseBlockWithView = DatabaseBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockNodeView);
  },
});
