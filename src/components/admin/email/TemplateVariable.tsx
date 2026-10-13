import { nodeInputRule, nodePasteRule } from '@tiptap/core';
import { EmailNode } from '@react-email/editor/core';

export const TemplateVariable = EmailNode.create({
  name: 'templateVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      name: { default: '', parseHTML: (element: HTMLElement) => element.dataset.emailVariable },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-email-variable]' }];
  },
  renderHTML({ node }) {
    return [
      'span',
      { 'data-email-variable': node.attrs.name, class: 'email-variable', contenteditable: 'false' },
      `{{${node.attrs.name}}}`,
    ];
  },
  renderText({ node }) {
    return `{{${node.attrs.name}}}`;
  },
  renderToReactEmail({ node }) {
    return <>{`{{${node.attrs?.name}}}`}</>;
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\{\{([\w.-]+)\}\}$/,
        type: this.type,
        getAttributes: (match) => ({ name: match[1] }),
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: /\{\{([\w.-]+)\}\}/g,
        type: this.type,
        getAttributes: (match) => ({ name: match[1] }),
      }),
    ];
  },
});
