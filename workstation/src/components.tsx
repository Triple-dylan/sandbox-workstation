import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowLeft,
  ArrowDown,
  Plus,
  MessageSquare,
  Network,
  FolderOpen,
  FileText,
  BookOpen,
  Lock,
  Users,
  Globe,
  Ellipsis,
  ShieldCheck,
  ArrowUpRight,
  Sun,
  Moon,
  Monitor,
  AlertCircle,
  Workflow,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resources, initialConversations, type Conversation, type Theme } from './model';
export type WorkspaceContext = {
  selected: string;
  conversations: Conversation[];
  reply: string | null;
  setReply: (id: string | null) => void;
  doc: string;
  openResource: (id: string) => void;
  subject: string;
  setSubject: (id: string) => void;
  autonomy: string;
  setAutonomy: (mode: string) => void;
};
export const Workspace = createContext<WorkspaceContext>(null!);
const readingPositions: Record<string, number> = {};
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  children,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type="button"
      className={`icon-button ${active ? 'active' : ''} ${rest.className || ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon size={19} strokeWidth={1.65} />
      {children}
    </button>
  );
}

export function useTheme(theme: Theme) {
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === 'system' ? (query.matches ? 'dark' : 'light') : theme);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
}

export function ConversationView() {
  const w = useContext(Workspace);
  const conversation = w.conversations.find((c) => c.id === w.selected)!;
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation?.id, conversation?.messages.length]);
  if (!conversation) return null;
  const roots = conversation.messages.filter((m) => !m.replyTo);
  const replies = conversation.messages.filter((m) => m.replyTo === w.reply);
  const root = conversation.messages.find((m) => m.id === w.reply);
  return (
    <div className="conversation-view">
      <div className="conversation-scope">
        {conversation.kind === 'channel' ? <Users size={14} /> : <Lock size={14} />}
        <span>
          {conversation.kind === 'channel'
            ? 'Recorded project discussion'
            : conversation.kind === 'dm'
              ? `Only you and ${conversation.recipient} when connected`
              : 'Private conversation'}
          {conversation.kind === 'channel' && ' · imported excerpts'}
        </span>
      </div>
      <div className="transcript">
        {root ? (
          <>
            <button className="text-button thread-back" onClick={() => w.setReply(null)}>
              <ArrowLeft size={14} />
              Back to conversation
            </button>
            <MessageItem message={root} />
            <div className="thread-divider">Thread</div>
            {replies.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
          </>
        ) : roots.length ? (
          roots.map((m) => (
            <div key={m.id}>
              <MessageItem message={m} />
              <button className="reply-button" onClick={() => w.setReply(m.id)}>
                <MessageSquare size={13} />
                {conversation.messages.filter((r) => r.replyTo === m.id).length || 'Reply'}
                {conversation.messages.some((r) => r.replyTo === m.id) ? ' replies' : ''}
              </button>
            </div>
          ))
        ) : (
          <div className="conversation-empty">
            <MessageSquare size={26} strokeWidth={1.2} />
            <strong>
              {conversation.kind === 'dm'
                ? 'Start a direct message'
                : 'Your conversation starts here'}
            </strong>
            <p>
              {conversation.kind === 'dm'
                ? 'No project is required. This draft stays in your personal conversations.'
                : 'Write in the floating composer. Your draft stays with this conversation.'}
            </p>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="local-footnote">
        Messages are stored locally · no delivery or agent connected
      </div>
    </div>
  );
}

export function MessageItem({ message }: { message: Conversation['messages'][number] }) {
  const w = useContext(Workspace);
  return (
    <article className="message">
      <div className="message-avatar">{message.author === 'You' ? 'D' : 'D'}</div>
      <div>
        <div className="message-meta">
          <strong>{message.author}</strong>
          <time>{message.at}</time>
        </div>
        <p>{message.text}</p>
        {Array.isArray(message.sources) && message.sources.length > 0 && (
          <div className="message-sources">
            {message.sources.map((id) => (
              <button key={id} onClick={() => w?.openResource(id)}>
                <FileText size={13} />
                {resources.find((r) => r.id === id)?.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function DocumentView() {
  const w = useContext(Workspace),
    r = resources.find((r) => r.id === w.doc)!;
  const [text, setText] = useState(''),
    [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const scroll = useRef<HTMLDivElement>(null),
    positions = useRef(readingPositions);
  useEffect(() => {
    let active = true;
    setText('');
    setError(false);
    fetch(`/resources/${encodeURIComponent(r.file)}`)
      .then((r) => {
        if (!r.ok) throw Error();
        return r.text();
      })
      .then((t) => {
        if (active) {
          setText(t);
          requestAnimationFrame(() => {
            if (scroll.current) scroll.current.scrollTop = positions.current[r.id] || 0;
          });
        }
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [r.id, retry]);
  return (
    <div className="document-view">
      <div className="document-toolbar">
        <span>
          <FileText size={14} />
          Markdown source
        </span>
        <a
          href={`/resources/${encodeURIComponent(r.file)}`}
          download={r.file}
          title="Download Markdown source"
        >
          <ArrowDown size={15} />
          <span>Download</span>
        </a>
      </div>
      <div
        ref={scroll}
        className="document-scroll"
        onScroll={(e) => (positions.current[r.id] = e.currentTarget.scrollTop)}
      >
        {error ? (
          <div className="error-state">
            <AlertCircle size={20} />
            <strong>Document could not be loaded</strong>
            <p>Check the local preview server and reopen this source.</p>
            <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
              Retry document
            </button>
          </div>
        ) : text ? (
          <article className="document-content">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  const resource = resources.find(
                    (r) => encodeURI(r.file) === href || r.file === href,
                  );
                  const target = resource
                    ? `/resources/${encodeURIComponent(resource.file)}`
                    : href?.startsWith('http') || href?.startsWith('#')
                      ? href
                      : `https://github.com/Triple-dylan/sandbox-workstation/blob/main/${href || ''}`;
                  return (
                    <a
                      href={target}
                      target={resource ? undefined : '_blank'}
                      rel="noreferrer"
                      onClick={(e) => {
                        if (resource && !e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          w.openResource(resource.id);
                        }
                      }}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {text}
            </Markdown>
          </article>
        ) : (
          <div className="loading-state">Loading source…</div>
        )}
      </div>
      <div className="document-footer">
        <span className="status-dot" />
        Repository source snapshot · read only <span>Identity: {r.id}</span>
      </div>
    </div>
  );
}

export function AgentSettings() {
  const w = useContext(Workspace);
  return (
    <div className="settings-content">
      <div className="status-line">
        <span className="status-dot offline" />
        Runtime not connected
      </div>
      <h2>Personal agent preferences</h2>
      <p>These preferences are saved locally. They do not start an agent.</p>
      <fieldset>
        <legend>Before changing private work</legend>
        {[
          ['ask', 'Ask before applying changes'],
          ['autonomous', 'Allow autonomous changes'],
        ].map(([value, label]) => (
          <label className="radio-row" key={value}>
            <input
              type="radio"
              name="autonomy"
              value={value}
              checked={w.autonomy === value}
              onChange={() => w.setAutonomy(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="context-callout">
        <ShieldCheck size={19} />
        <p>
          Shared work follows the project’s approval policy. Personal preferences cannot override
          it.
        </p>
      </div>
      <div className="integration-state">
        <strong>Project agent</strong>
        <p>
          Assignment, routine execution and source-linked context maintenance require the agent
          service. No agent is running in this proof.
        </p>
      </div>
    </div>
  );
}

export function BrowserProof() {
  return (
    <div className="browser-proof">
      <div className="browser-address">
        <Lock size={14} />
        <span>Personal browser session</span>
      </div>
      <div className="integration-state">
        <Globe size={29} strokeWidth={1.2} />
        <h2>Browser session not connected</h2>
        <p>
          Interactive browsing needs an isolated browser service. An arbitrary iframe cannot provide
          authenticated browsing safely.
        </p>
        <p>This independent pane can be snapped and resized. It is not a working browser.</p>
        <a
          href="https://docs.browserless.io/baas/monitor-sessions/embedding-live-url"
          target="_blank"
          rel="noreferrer"
        >
          Session feasibility reference <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export function WidthDivider({
  label,
  value,
  min,
  max,
  setValue,
  reverse = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  setValue: (v: number) => void;
  reverse?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div
      className="width-divider"
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setValue(clamp(value + (e.key === 'ArrowLeft' ? -16 : 16) * (reverse ? -1 : 1)));
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setValue(min);
        }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const start = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const element = e.currentTarget;
        const move = (event: PointerEvent) =>
          setValue(clamp(value + (event.clientX - start) * (reverse ? -1 : 1)));
        const end = () => {
          element.removeEventListener('pointermove', move);
          element.removeEventListener('pointerup', end);
          element.removeEventListener('pointercancel', end);
        };
        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', end);
        element.addEventListener('pointercancel', end);
      }}
    />
  );
}

export function Materials() {
  const [theme, setTheme] = useState<Theme>('system');
  useTheme(theme);
  return (
    <main className="materials">
      <header>
        <span>Stage A · component and material proof</span>
        <h1>Space to work. Structure that holds.</h1>
        <p>Glass defines the shell. Content stays crisp. Controls explain the action.</p>
        <div className="theme-options">
          {(['system', 'light', 'dark'] as Theme[]).map((t, i) => (
            <IconButton
              key={t}
              icon={[Monitor, Sun, Moon][i]}
              label={t}
              active={theme === t}
              onClick={() => setTheme(t)}
            />
          ))}
        </div>
        <a href="/">
          Open layout proof <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="material-grid">
        <section className="material-specimen glass">
          <div className="utility-header">
            <BookOpen size={17} />
            <strong>Sources & context</strong>
            <IconButton icon={Ellipsis} label="Source options" />
          </div>
          <div className="source-rows">
            {resources.map((r) => (
              <div key={r.id}>
                <FileText size={16} />
                <span>{r.title}</span>
                <ArrowUpRight size={13} />
              </div>
            ))}
          </div>
          <div className="utility-note">Source references retain canonical identity.</div>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <Workflow size={17} />
            <strong>Project agent</strong>
          </div>
          <div className="material-statuses">
            <p>
              <span className="status-dot" />
              Ready
            </p>
            <p>
              <span className="status-dot warning" />
              Awaiting approval
            </p>
            <p>
              <span className="status-dot offline" />
              Disconnected
            </p>
            <div className="context-callout">
              <ShieldCheck size={20} />
              <p>Apply proposed changes to the shared document?</p>
            </div>
            <div className="button-row">
              <button className="primary">Review changes</button>
              <button className="secondary">Reject</button>
            </div>
          </div>
        </section>
        <section className="material-specimen reading">
          <div className="utility-header">
            <FileText size={17} />
            <strong>Document surface</strong>
          </div>
          <article className="document-content">
            <span className="eyebrow">Reading surface</span>
            <h2>Context should travel with the work.</h2>
            <p>
              People decide what is private and shared. Agents maintain useful orientation,
              references and history as work happens.
            </p>
            <blockquote>Legibility comes before translucency.</blockquote>
            <a href="/resources/Rebuild%20Plan.md">Read the approved plan</a>
          </article>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <MessageSquare size={17} />
            <strong>Conversation</strong>
          </div>
          <MessageItem message={initialConversations[0].messages[1]} />
          <div className="sample-composer">
            <textarea aria-label="Example composer" placeholder="Message…" />
            <div>
              <IconButton icon={Plus} label="Attach context" />
              <button className="send-button" aria-label="Send example">
                <ArrowUp size={20} />
              </button>
            </div>
          </div>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <Network size={17} />
            <strong>Node grammar</strong>
          </div>
          <div className="grammar">
            <span className="grammar-hub" />
            <div>
              <strong>Project</strong>
              <small>Anchored subject, spring return</small>
            </div>
            <FolderOpen size={25} />
            <div>
              <strong>Folder</strong>
              <small>Contained branch, opens explorer</small>
            </div>
            <FileText size={24} />
            <div>
              <strong>Document</strong>
              <small>Canonical file, reuses viewer</small>
            </div>
          </div>
        </section>
        <section className="material-specimen glass">
          <div className="utility-header">
            <AlertCircle size={17} />
            <strong>Recovery and focus</strong>
          </div>
          <div className="material-statuses">
            <div className="error-state">
              <strong>Connection interrupted</strong>
              <p>Your draft is safe. Reconnect to resume delivery.</p>
              <button className="secondary">Reconnect</button>
            </div>
            <p>Keyboard focus</p>
            <button className="secondary focus-example">
              Open document <ArrowUpRight size={15} />
            </button>
            <p className="quiet-note">
              Reduced motion and reduced transparency follow system preferences.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
