import type { ReactNode } from 'react';
import { GlossaryLinkedProse } from '@/components/tags/GlossaryLinkedText';

// Deliberately small Markdown subset: headings, bullet lists and source links.
// Raw HTML is always text; links accept only absolute HTTP(S) URLs.
function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    return link ? (
      <a
        key={i}
        href={link[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {link[1]}
      </a>
    ) : (
      part
    );
  });
}

export function GuideProse({ text }: { text: string }) {
  if (!/^#{1,3} |^- |\[[^\]]+\]\(https?:/m.test(text)) {
    return (
      <GlossaryLinkedProse
        text={text}
        className="space-y-6"
        paragraphClassName="text-body-lg leading-relaxed"
      />
    );
  }
  return (
    <div className="space-y-6 text-body-lg leading-relaxed">
      {text.split(/\n\n+/).map((block, i) => {
        if (/^#{1,3} /.test(block))
          return (
            <h2 key={i} className="text-heading-sm">
              {inline(block.replace(/^#{1,3} /, ''))}
            </h2>
          );
        if (block.split('\n').every((line) => line.startsWith('- ')))
          return (
            <ul key={i} className="list-disc pl-6 space-y-2">
              {block.split('\n').map((line, j) => (
                <li key={j}>{inline(line.slice(2))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
