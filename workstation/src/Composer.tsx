import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ArrowUp, Paperclip, X, FileText, Lock, Search } from 'lucide-react';
import { IconButton } from './components';
import type { Conversation, Resource, Message } from './model';
export function Composer({
  current,
  draft,
  attachments,
  resources,
  reply,
  onExitReply,
  onChange,
  onSend,
  onAttach,
  onRemove,
  onOpen,
  shortcut,
  inputRef,
}: {
  current: Conversation;
  draft: string;
  attachments: string[];
  resources: Resource[];
  reply?: Message;
  onExitReply: () => void;
  onChange: (text: string) => void;
  onSend: () => void;
  onAttach: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  shortcut: 'enter' | 'modifier';
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [attaching, setAttaching] = useState(false),
    [query, setQuery] = useState('');
  const attachmentHost = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(160, Math.max(32, el.scrollHeight))}px`;
    }
  }, [draft, current.id, reply?.id]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!attachmentHost.current?.contains(e.target as Node)) setAttaching(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const destination =
    current.kind === 'channel'
      ? `#${current.title}`
      : current.kind === 'dm'
        ? current.recipient
        : current.title === 'New chat'
          ? 'Private conversation'
          : current.title;
  return (
    <form
      className="composer glass mature-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      {reply && (
        <div className="reply-target">
          <div>
            <strong>Reply to {reply.author.replace(' · recorded feedback', '')}</strong>
            <span>{reply.text}</span>
          </div>
          <IconButton icon={X} label="Exit thread reply" onClick={onExitReply} />
        </div>
      )}
      {attachments.length > 0 && (
        <div className="draft-sources">
          {attachments.map((id) => (
            <span key={id}>
              <button className="attachment-preview" type="button" onClick={() => onOpen(id)}>
                <FileText size={13} />
                {resources.find((r) => r.id === id)?.title}
              </button>
              <IconButton
                icon={X}
                label={`Remove ${resources.find((r) => r.id === id)?.title} attachment`}
                onClick={() => onRemove(id)}
              />
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        id="composer"
        aria-label={
          current.kind === 'channel'
            ? `Message #${current.title}`
            : current.kind === 'dm'
              ? `Message ${current.recipient}`
              : 'Message in private chat'
        }
        placeholder="Message…"
        rows={1}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && attaching) {
            setAttaching(false);
            e.stopPropagation();
          }
          if (
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            !e.shiftKey &&
            !e.altKey &&
            (shortcut === 'enter' || e.metaKey || e.ctrlKey)
          ) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="composer-actions">
        <div className="add-anchor" ref={attachmentHost}>
          <IconButton
            icon={Paperclip}
            label="Attach context"
            active={attaching}
            aria-expanded={attaching}
            onClick={() => {
              setAttaching(!attaching);
              setQuery('');
            }}
          />
          {attaching && (
            <div
              className="popover add-pop glass attachment-picker"
              role="dialog"
              aria-label="Attach a document"
            >
              <label className="work-search">
                <Search size={14} />
                <input
                  aria-label="Find context to attach"
                  placeholder="Find a document…"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {current.kind !== 'private' && resources.some((r) => r.folder === 'private') && (
                <p className="attachment-access-note">
                  Private documents must be shared before attaching them here. Sharing is not
                  connected in this preview.
                </p>
              )}
              <div>
                {resources
                  .filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
                  .map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      disabled={
                        attachments.includes(r.id) ||
                        (current.kind !== 'private' && r.folder === 'private')
                      }
                      title={
                        current.kind !== 'private' && r.folder === 'private'
                          ? 'Share this private document before attaching it here'
                          : undefined
                      }
                      onClick={() => {
                        onAttach(r.id);
                        setAttaching(false);
                        inputRef.current?.focus();
                      }}
                    >
                      <FileText size={14} />
                      {r.title}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <span className="composer-audience">
          {current.kind !== 'channel' && <Lock size={11} />}
          <span>
            {destination}
            {reply ? ' · thread' : ''}
          </span>
        </span>
        <button
          className="send-button"
          aria-label="Send message"
          title={shortcut === 'enter' ? 'Send · Enter' : 'Send · ⌘/Ctrl Enter'}
          type="submit"
          disabled={!draft.trim()}
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </form>
  );
}
