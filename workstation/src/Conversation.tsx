import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, Lock, Hash, Search, X } from 'lucide-react';
import { Workspace, MessageItem, IconButton } from './components';
const positionKey = 'workstation-conversation-positions-v1';
function positions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(positionKey) || '{}');
  } catch {
    return {};
  }
}
export function ConversationView() {
  const w = useContext(Workspace);
  const c = w.conversations.find((c) => c.id === w.selected)!;
  const scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true);
  const [query, setQuery] = useState(''),
    [searching, setSearching] = useState(false),
    [newContent, setNewContent] = useState(false);
  const key = `${c.id}::${w.reply || 'main'}`;
  const previous = useRef('');
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (previous.current !== key) {
      const saved = positions()[key];
      el.scrollTop = typeof saved === 'number' ? saved : el.scrollHeight;
      previous.current = key;
      setNewContent(false);
    } else if (nearBottom.current || c.messages.at(-1)?.author === 'You') {
      el.scrollTop = el.scrollHeight;
    } else setNewContent(true);
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, [key, c.messages.length]);
  const root = c.messages.find((m) => m.id === w.reply);
  const visible = root
    ? c.messages.filter((m) => m.replyTo === root.id)
    : c.messages.filter((m) => !m.replyTo);
  const result = query.trim()
    ? c.messages.filter((m) => `${m.author} ${m.text}`.toLowerCase().includes(query.toLowerCase()))
    : [];
  const viewMessage = (id: string, replyTo?: string) => {
    setQuery('');
    setSearching(false);
    w.setReply(replyTo || null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector(`[data-message="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'center' }),
      ),
    );
  };
  return (
    <div className="conversation-view mature-conversation">
      <div className="conversation-scope">
        <span>
          {c.kind === 'channel' ? <Hash size={13} /> : <Lock size={13} />}{' '}
          {c.kind === 'channel'
            ? 'Project channel · recorded discussion'
            : c.kind === 'dm'
              ? `Local draft for ${c.recipient} · recipient unverified`
              : 'Only you · local conversation'}
        </span>
        <IconButton
          icon={searching ? X : Search}
          label={searching ? 'Close message search' : 'Search this conversation'}
          onClick={() => {
            setSearching(!searching);
            setQuery('');
          }}
        />
      </div>
      {searching && (
        <label className="search-field transcript-search">
          <Search size={14} />
          <input
            autoFocus
            aria-label="Search messages"
            placeholder="Search messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {query.trim() ? (
        <div className="message-search-results">
          <small>
            {result.length} {result.length === 1 ? 'result' : 'results'}
          </small>
          {result.map((m) => (
            <button key={m.id} onClick={() => viewMessage(m.id, m.replyTo)}>
              <strong>{m.author}</strong>
              <p>{m.text}</p>
              {m.replyTo && <small>In a thread</small>}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="transcript"
          ref={scroll}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (nearBottom.current) setNewContent(false);
            try {
              sessionStorage.setItem(
                positionKey,
                JSON.stringify({ ...positions(), [key]: el.scrollTop }),
              );
            } catch {
              /* Reading state can be reconstructed without losing messages. */
            }
          }}
        >
          {root && (
            <>
              <button className="text-button thread-back" onClick={() => w.setReply(null)}>
                <ArrowLeft size={14} />
                Back to conversation
              </button>
              <MessageItem message={root} />
              <div className="thread-divider">
                {visible.length} {visible.length === 1 ? 'reply' : 'replies'}
              </div>
            </>
          )}
          {visible.length
            ? visible.map((m, i) => {
                const replies = c.messages.filter((r) => r.replyTo === m.id).length;
                const label = m.createdAt
                  ? new Date(m.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Recorded discussion';
                const prior = visible[i - 1];
                const previousLabel = prior?.createdAt
                  ? new Date(prior.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Recorded discussion';
                return (
                  <div key={m.id} data-message={m.id}>
                    {(!i || label !== previousLabel) && !root && (
                      <div className="date-separator">
                        <span>{label}</span>
                      </div>
                    )}
                    <MessageItem message={m} />
                    {!root && (
                      <button className="reply-button" onClick={() => w.setReply(m.id)}>
                        {replies
                          ? `${replies} ${replies === 1 ? 'reply' : 'replies'}`
                          : 'Reply in thread'}
                      </button>
                    )}
                  </div>
                );
              })
            : !root && (
                <div className="conversation-empty">
                  <strong>{c.title === 'New chat' ? 'New private conversation' : c.title}</strong>
                  <p>Write below. Your draft stays here when you move to other work.</p>
                </div>
              )}
          {root && !visible.length && (
            <p className="thread-empty">Reply below to continue this discussion.</p>
          )}
        </div>
      )}
      {newContent && (
        <button
          className="jump-to-new"
          onClick={() => {
            if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
            setNewContent(false);
          }}
        >
          <ArrowDown size={14} />
          New messages
        </button>
      )}
      <div className="local-footnote">Saved on this browser · delivery not connected</div>
    </div>
  );
}
