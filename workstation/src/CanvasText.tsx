import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { GripVertical, X, MoveDiagonal2 } from 'lucide-react';
import type { Resource, WritingBlock } from './model';
import { newBlock } from './CanvasWriting';

function TextLine({
  block,
  index,
  onChange,
  onEnter,
  onFocus,
  onBoundary,
}: {
  block: WritingBlock;
  index: number;
  onChange: (text: string) => void;
  onEnter: (before: string, after: string) => void;
  onFocus: () => void;
  onBoundary: (direction: -1 | 1) => boolean;
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
        onFocus={onFocus}
        onInput={(e) => onChange(e.currentTarget.innerText.replace(/\r/g, ''))}
        onKeyDown={(e) => {
          if (
            (e.key === 'Backspace' || e.key === 'Delete') &&
            !e.nativeEvent.isComposing &&
            !e.altKey &&
            !e.ctrlKey &&
            !e.metaKey
          ) {
            const selection = window.getSelection();
            const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
            if (range?.collapsed && e.currentTarget.contains(range.startContainer)) {
              const remaining = document.createRange();
              remaining.selectNodeContents(e.currentTarget);
              if (e.key === 'Backspace') remaining.setEnd(range.startContainer, range.startOffset);
              else remaining.setStart(range.endContainer, range.endOffset);
              if (!remaining.toString() && onBoundary(e.key === 'Backspace' ? -1 : 1))
                e.preventDefault();
            }
          }
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
  const [activeBlock, setActiveBlock] = useState(blocks[0]?.id);
  const focusAt = (index: number, offset = 0) =>
    requestAnimationFrame(() => {
      const el = root.current?.querySelectorAll<HTMLElement>('[contenteditable]')[index];
      if (!el) return;
      el.focus();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let remaining = offset;
      while (node && remaining > (node.textContent?.length || 0)) {
        remaining -= node.textContent?.length || 0;
        node = walker.nextNode();
      }
      const range = document.createRange();
      if (node) range.setStart(node, Math.min(remaining, node.textContent?.length || 0));
      else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
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
              onFocus={() => setActiveBlock(block.id)}
              onBoundary={(direction) => {
                const neighbour = blocks[index + direction];
                if (!neighbour) return false;
                const left = direction === -1 ? neighbour : block;
                const right = direction === -1 ? block : neighbour;
                const next = [...blocks];
                const target = direction === -1 ? index - 1 : index;
                next.splice(target, 2, { ...left, text: left.text + right.text });
                onChange(next);
                focusAt(target, left.text.length);
                return true;
              }}
              onChange={(text) =>
                onChange(blocks.map((b) => (b.id === block.id ? { ...b, text } : b)))
              }
              onEnter={(before, after) => {
                if (!block.text && (block.type === 'bullet' || block.type === 'check')) {
                  onChange(
                    blocks.map((b) => (b.id === block.id ? { ...b, type: 'paragraph' } : b)),
                  );
                  return;
                }
                const next = [...blocks];
                next[index] = { ...block, text: before };
                next.splice(index + 1, 0, {
                  ...newBlock(block.type === 'heading' ? 'paragraph' : block.type),
                  text: after,
                });
                onChange(next);
                focusAt(index + 1);
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
          <button
            key={type}
            aria-pressed={blocks.find((b) => b.id === activeBlock)?.type === type}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(blocks.map((b) => (b.id === activeBlock ? { ...b, type } : b)))}
            title={`Format the current block as ${['text', 'a heading', 'a list', 'a checklist'][i]}`}
          >
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
