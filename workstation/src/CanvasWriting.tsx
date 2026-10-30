import { useLayoutEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Resource, WritingBlock } from './model';

export const newBlock = (type: WritingBlock['type'] = 'paragraph'): WritingBlock => ({
  id: crypto.randomUUID(),
  type,
  text: '',
});
export function writingMarkdown(blocks: WritingBlock[]) {
  return blocks
    .map(
      (b) =>
        `${b.type === 'heading' ? '## ' : b.type === 'bullet' ? '- ' : b.type === 'check' ? `- [${b.done ? 'x' : ' '}] ` : ''}${b.text}`,
    )
    .join('\n\n');
}
function WritingLine({
  block,
  index,
  change,
  add,
  remove,
}: {
  block: WritingBlock;
  index: number;
  change: (patch: Partial<WritingBlock>) => void;
  add: () => void;
  remove: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const size = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    size();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        size();
      }
    });
    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, [block.text, block.type]);
  return (
    <div className={`writing-line writing-${block.type}`}>
      {block.type === 'check' && (
        <input
          type="checkbox"
          aria-label={`Complete writing item ${index + 1}`}
          checked={!!block.done}
          onChange={(e) => change({ done: e.target.checked })}
        />
      )}
      {block.type === 'bullet' && <span aria-hidden="true">•</span>}
      <textarea
        ref={ref}
        rows={1}
        aria-label={`Writing block ${index + 1}`}
        value={block.text}
        placeholder={
          block.type === 'heading' ? 'Heading' : block.type === 'check' ? 'Action…' : 'Write here…'
        }
        onChange={(e) => change({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
      />
      <button
        className="icon-button"
        aria-label={`Remove writing block ${index + 1}`}
        onClick={remove}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
export function CanvasWriting({
  resource,
  onChange,
}: {
  resource?: Resource;
  onChange: (blocks: WritingBlock[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  if (!resource?.blocks) return <p className="canvas-unavailable">This writing is unavailable.</p>;
  const blocks = resource.blocks;
  const insert = (type: WritingBlock['type'], after = blocks.length - 1) => {
    const next = [...blocks];
    next.splice(after + 1, 0, newBlock(type));
    onChange(next);
    requestAnimationFrame(() => root.current?.querySelectorAll('textarea')[after + 1]?.focus());
  };
  return (
    <div className="canvas-writing" ref={root}>
      <div className="writing-blocks">
        {blocks.map((b, index) => (
          <WritingLine
            key={b.id}
            block={b}
            index={index}
            change={(patch) =>
              onChange(blocks.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))
            }
            add={() => insert(b.type === 'heading' ? 'paragraph' : b.type, index)}
            remove={() =>
              onChange(
                blocks.length > 1 ? blocks.filter((x) => x.id !== b.id) : [{ ...b, text: '' }],
              )
            }
          />
        ))}
      </div>
      <div className="writing-insert" aria-label="Add canvas content">
        <Plus size={13} aria-hidden="true" />
        <button onClick={() => insert('paragraph')}>Text</button>
        <button onClick={() => insert('heading')}>Heading</button>
        <button onClick={() => insert('bullet')}>List</button>
        <button onClick={() => insert('check')}>Checklist</button>
      </div>
      <small className="writing-scope">Private</small>
    </div>
  );
}
