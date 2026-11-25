import { useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { api } from '../../data/client.ts';
import { useWorkspace } from '../../app/workspace.tsx';
import type { Conversation, Message } from '../../../shared/types.ts';
import {
  audienceKey,
  defaultAudience,
  describeAudience,
  stillValid,
  type Audience,
} from './audience.ts';

export function Composer() {
  const { s, ui, setUi, space, resource, run, openConversation } = useWorkspace();
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const saved = ui.audience[space.id];
  const chosen = saved?.kind === 'discuss' ? saved : null;
  const active = s.conversations.find((c) => c.id === ui.conversationId);
  const audience: Audience | null = active
    ? { kind: 'conversation', conversationId: active.id }
    : chosen && stillValid(s, chosen)
      ? chosen
      : defaultAudience(s, space.id);
  const key = audience ? audienceKey(audience) : '';
  const text = ui.drafts[key] ?? '';
  const described = audience ? describeAudience(s, audience) : null;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (chosen?.kind === 'discuss') input.current?.focus();
  }, [chosen]);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const setText = (value: string) => setUi((old) => ({ drafts: { ...old.drafts, [key]: value } }));

  const send = async () => {
    if (!audience || !text.trim() || sending) return;
    setSending(true);
    const sent = await run(async () => {
      let conversationId: string;
      let anchor: { resourceId: string; quote: string } | null = null;
      if (audience.kind === 'personal-work') {
        conversationId = (await api<Conversation>('/personal-chats', { body: { title: text } })).id;
      } else if (audience.kind === 'project-work') {
        conversationId = (
          await api<Conversation>('/agent-work', {
            body: { spaceId: audience.spaceId, agentId: audience.agentId, title: text },
          })
        ).id;
      } else if (audience.kind === 'person') {
        conversationId = (await api<Conversation>('/dms', { body: { userId: audience.userId } }))
          .id;
      } else if (audience.kind === 'discuss') {
        conversationId = (
          await api<Conversation>('/discussions', { body: { resourceId: audience.resourceId } })
        ).id;
        const r = resource(audience.resourceId);
        anchor = {
          resourceId: audience.resourceId,
          quote: (audience.quote || r?.body || r?.title || '').slice(0, 200),
        };
      } else {
        conversationId = audience.conversationId;
      }
      await api<Message>('/messages', {
        body: {
          conversationId,
          text: text.replace(/^\/assign\s+/i, ''),
          delegate: /^\/assign\s+/i.test(text),
          anchor,
        },
      });
      return conversationId;
    });
    setSending(false);
    if (!sent) return;
    setUi((old) => (old.drafts[key] === text ? { drafts: { ...old.drafts, [key]: '' } } : {}));
    if (mounted.current) openConversation(sent);
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
        <span className="audience-label">
          <span>To: {described.label}</span>
          <small>{described.detail}</small>
        </span>
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
          }}
        />
        <button className="send" type="submit" aria-label="Send" disabled={!text.trim() || sending}>
          <ArrowUp size={16} />
        </button>
      </div>
    </form>
  );
}
