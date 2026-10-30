import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import { GripVertical, X, MoveDiagonal2 } from 'lucide-react';
import type { Resource, WritingBlock } from './model';
import { newBlock } from './CanvasWriting';

function TextLine({
  block,
  index,
  onChange,
  onEnter,
}: {
  block: WritingBlock;
  index: number;
  onChange: (text: string) => void;
  onEnter: (before: string, after: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    if (el.innerText.replace(/\r/g, '') !== block.text) el.textContent = block.text;
  }, [block.text]);
  return (
    <div className={`canvas-text-line text-${block.type}`}>
      {block.type === 'bullet' && <span aria-hidden="true">•</span>}
      <div
        ref={ref}
        contentEditable="plaintext-only"
        role="textbox"
        aria-multiline="true"
        aria-label={`Writing block ${index + 1}`}
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerText.replace(/\r/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            const selection = window.getSelection();
            const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
            const before = document.createRange();
            before.selectNodeContents(e.currentTarget);
            if (range && e.currentTarget.contains(range.startContainer)) {
              before.setEnd(range.startContainer, range.startOffset);
              const after = document.createRange();
              after.selectNodeContents(e.currentTarget);
              after.setStart(range.endContainer, range.endOffset);
              onEnter(before.toString(), after.toString());
            } else onEnter(block.text, '');
          }
        }}
      />
    </div>
  );
}
export function CanvasText({
  resource,
  draft,
  maxHeight,
  onChange,
  onMeasure,
  onAbandon,
  onMove,
  onResize,
  onStep,
  onClose,
}: {
  resource: Resource;
  draft: boolean;
  maxHeight: number;
  onChange: (blocks: WritingBlock[]) => void;
  onMeasure: (height: number) => void;
  onAbandon: () => void;
  onMove: (e: PointerEvent) => void;
  onResize: (e: PointerEvent) => void;
  onStep: (x: number, y: number) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const blocks = resource.blocks || [];
  useLayoutEffect(() => {
    const el = content.current!;
    const measure = () => onMeasure(Math.min(maxHeight, Math.max(56, el.scrollHeight + 30)));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [blocks, maxHeight, onMeasure]);
  useLayoutEffect(() => {
    if (draft) root.current?.querySelector<HTMLElement>('[contenteditable]')?.focus();
  }, []);
  const insert = (after: number, type: WritingBlock['type']) => {
    const next = [...blocks];
    next.splice(after + 1, 0, newBlock(type));
    onChange(next);
    requestAnimationFrame(() =>
      root.current?.querySelectorAll<HTMLElement>('[contenteditable]')[after + 1]?.focus(),
    );
  };
  return (
    <div
      className="canvas-text"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onAbandon();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          (document.activeElement as HTMLElement)?.blur();
          onAbandon();
        }
      }}
    >
      <div
        className="canvas-text-content"
        ref={content}
        style={{ maxHeight: Math.max(26, maxHeight - 30) }}
      >
        {blocks.map((block, index) => (
          <div className="text-block" key={block.id}>
            {block.type === 'check' && (
              <input
                type="checkbox"
                aria-label={`Complete writing item ${index + 1}`}
                checked={!!block.done}
                onChange={(e) =>
                  onChange(
                    blocks.map((b) => (b.id === block.id ? { ...b, done: e.target.checked } : b)),
                  )
                }
              />
            )}
            <TextLine
              block={block}
              index={index}
              onChange={(text) =>
                onChange(blocks.map((b) => (b.id === block.id ? { ...b, text } : b)))
              }
              onEnter={(before, after) => {
                const next = [...blocks];
                next[index] = { ...block, text: before };
                next.splice(index + 1, 0, {
                  ...newBlock(block.type === 'heading' ? 'paragraph' : block.type),
                  text: after,
                });
                onChange(next);
                requestAnimationFrame(() => {
                  const el =
                    root.current?.querySelectorAll<HTMLElement>('[contenteditable]')[index + 1];
                  if (!el) return;
                  el.focus();
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  range.collapse(true);
                  const selection = window.getSelection();
                  selection?.removeAllRanges();
                  selection?.addRange(range);
                });
              }}
            />
          </div>
        ))}
      </div>
      <div
        className={`text-affordances ${draft ? 'draft-affordances' : ''}`}
        aria-label="Text controls"
      >
        <button
          data-move-handle
          aria-label="Move writing"
          title="Drag to move; Shift-drag to share an edge"
          onPointerDown={onMove}
          onKeyDown={(e) => {
            const delta = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[e.key];
            if (delta) {
              e.preventDefault();
              onStep(delta[0], delta[1]);
            }
          }}
        >
          <GripVertical size={14} />
        </button>
        {(['paragraph', 'heading', 'bullet', 'check'] as const).map((type, i) => (
          <button key={type} onClick={() => insert(blocks.length - 1, type)}>
            {['Text', 'Heading', 'List', 'Checklist'][i]}
          </button>
        ))}
        <button aria-label="Resize writing" onPointerDown={onResize}>
          <MoveDiagonal2 size={13} />
        </button>
        <button aria-label="Close writing" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
