import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, X } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Conversation, Message } from '../../../shared/types.ts';
import {
  audienceKey,
  audienceOptions,
  defaultAudience,
  describeAudience,
  stillValid,
  type Audience,
} from './audience.ts';

export function Composer() {
  const { s, ui, setUi, space, resource, run, openConversation } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const chosen = ui.audience[space.id];
  const audience = chosen && stillValid(s, chosen) ? chosen : defaultAudience(s, space.id);
  const key = audience ? audienceKey(audience) : '';
  const text = ui.drafts[key] ?? '';
  const described = audience ? describeAudience(s, audience) : null;
  const options = audienceOptions(s, space.id, resource(ui.selectedId) ?? null);
  const groups = [...new Set(options.map((o) => o.group))];

  useEffect(() => {
    if (chosen?.kind === 'discuss') input.current?.focus();
  }, [chosen]);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const choose = (a: Audience) => {
    setUi((old) => ({ audience: { ...old.audience, [space.id]: a } }));
    setMenuOpen(false);
    input.current?.focus();
  };
  const setText = (value: string) => setUi((old) => ({ drafts: { ...old.drafts, [key]: value } }));

  const send = async () => {
    if (!audience || !text.trim() || sending) return;
    setSending(true);
    const sent = await run(async () => {
      let conversationId: string;
      let anchor: { resourceId: string; quote: string } | null = null;
      if (audience.kind === 'person') {
        conversationId = (await api<Conversation>('/dms', { body: { userId: audience.userId } }))
          .id;
      } else if (audience.kind === 'discuss') {
        conversationId = (
          await api<Conversation>('/discussions', { body: { resourceId: audience.resourceId } })
        ).id;
        const r = resource(audience.resourceId);
        const selection = window.getSelection()?.toString().trim();
        anchor = {
          resourceId: audience.resourceId,
          quote: (selection || r?.body || r?.title || '').slice(0, 200),
        };
      } else {
        conversationId = audience.conversationId;
      }
      const addressedTo =
        audience.kind === 'instruct' || audience.kind === 'delegate' ? audience.agentId : null;
      await api<Message>('/messages', {
        body: { conversationId, text, addressedTo, delegate: audience.kind === 'delegate', anchor },
      });
      return conversationId;
    });
    setSending(false);
    if (!sent) return;
    setText('');
    openConversation(sent);
  };

  if (!audience || !described) return null;
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="composer-audience">
        <button
          type="button"
          className="audience-chip"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          title={described.detail}
        >
          <span>To: {described.label}</span>
          <small>{described.detail}</small>
          <ChevronDown size={13} />
        </button>
        {audience.kind === 'discuss' && (
          <button
            type="button"
            className="audience-clear"
            aria-label="Stop discussing this item"
            onClick={() =>
              setUi((old) => ({
                audience: { ...old.audience, [space.id]: defaultAudience(s, space.id)! },
              }))
            }
          >
            <X size={13} />
          </button>
        )}
        {menuOpen && (
          <div className="audience-menu" role="listbox" aria-label="Send to">
            {groups.map((group) => (
              <div key={group} role="group" aria-label={group}>
                <h3>{group}</h3>
                {options
                  .filter((o) => o.group === group)
                  .map((o) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={audienceKey(o.audience) === key}
                      key={audienceKey(o.audience)}
                      onClick={() => choose(o.audience)}
                    >
                      <strong>{o.label}</strong>
                      <small>{o.detail}</small>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="composer-row">
        <textarea
          ref={input}
          rows={1}
          value={text}
          placeholder={described.placeholder}
          aria-label={`Message to ${described.label}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
            if (e.key === 'Escape') setMenuOpen(false);
          }}
        />
        <button className="send" type="submit" aria-label="Send" disabled={!text.trim() || sending}>
          <ArrowUp size={16} />
        </button>
      </div>
    </form>
  );
}
